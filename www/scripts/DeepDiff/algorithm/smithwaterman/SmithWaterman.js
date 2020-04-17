import {AlgorithmRegistry} from '../../algorithm/AlgorithmRegistry.js';
import * as AlgorithmResults from '../../algorithm/AlgorithmResults.js';
import {checkNotNull} from '../../util/misc.js';

import {swAlgoWebWorker} from './swAlgoWebWorker.js';

(function(){
	'use strict';


/**
 * Register each of our variants as a runnable algorithm
 */
['swAlgoCell','swAlgoGpu'].forEach(AlgoVariant=>{
	// come up with a unique name
	let name = 'smithwaterman-'+AlgoVariant;
	// Add a function to the registry
	AlgorithmRegistry.processors[name] = {
		proc: (req, progHandler)=>{
			// apply the variation settings
			req.AlgoVariant = AlgoVariant;
			// call the base function (see below)
			return ProcSW(req,progHandler);
		},
		available: true,
	};
});
// also register a default one
AlgorithmRegistry.processors['smithwaterman'] = AlgorithmRegistry.processors['smithwaterman-swAlgoCell'];

// test to ensure the software is capable of running
AlgorithmRegistry.processors['smithwaterman-swAlgoGpu'].available = (typeof window.OffscreenCanvas !== 'undefined');
if(!AlgorithmRegistry.processors['smithwaterman-swAlgoGpu'].available){
	AlgorithmRegistry.processors['smithwaterman'] = AlgorithmRegistry.processors['smithwaterman-swAlgoCell'];
}

const threads = {};
const scores = {
	MAX_SCORE:2**16,
	MIN_SCORE:0,
	// an exact positional match (diagonal in SmithWaterman terms). This is
	// the highest possible match.
	match:+2,
	// a exact mismatch. If the pattern continues, this character is a change.
	// An example of a mismatch would be "dune", and "dude": there is an
	// obvious match, but there is one character that has been completely
	// changed. This is the lowest possible match.
	mismatch: -1,
	// A partial mismatch. Generally, the insertion (or removal) of a
	// character. Depending on the context, this may be just as bad as a
	// "mismatch" or somewhere between "mismatch" and "match".
	skippable: -1,
	// The point to the terminus is to measure when the chain is broken.
	// A chain may grow in score, getting larger and larger, until
	// matches stop being made. At this point, the score will start dropping.
	// Once it drops by the points specified by the terminator, we can assume
	// it has dropped off.
	terminus: 5,
	// the final score that is considered
	// significant length.
	significant: 20,
};



/**
 * Do a comparison using SmithWaterman algorithm
 */
async function ProcSW(req, progHandler=()=>{}) {
	checkNotNull(req);

	if(req.action === 'stop'){
		if(req.name in threads){
			let thread = threads[req.name];
			thread.stop();
		}
		return null;
	}

	performance.mark('smithwaterman-start.'+req.name);

	let a = req.submissions[0];
	let b = req.submissions[1];
	let aTokens = a.finalList;
	let bTokens = b.finalList;

	//console.debug('Creating a SmithWaterman for ' + a.Name + ' and ' + b.Name);

	// Handle a 0-token submission (no similarity)
	if(aTokens.length === 0 || bTokens.length === 0) {
		//TODO: return req
		let result = await AlgorithmResults.Create(a, b, aTokens, bTokens, [], {error:'0 token submission'});
		result.complete = result.totalTokens;
		return result;
	}

	let SmithWaterman = req.AlgoVariant;
	let notes = {
		algorithm: 'smithwaterman-'+SmithWaterman
	};
	if(aTokens.length * bTokens.length > SmithWatermanBase.MAXAREA){
		notes.isMassive = true;
	}

	// Alright, easy cases taken care of. Generate an instance to perform the
	// actual algorithm. This is done (in many cases) on a separate thread, so
	// we don't know it is done until we get a call back. Stuff it in a
	// promise so we can await the response
	//
	// TODO: put the promise inside the class as something that can be 'awaited'
	let endLists = await new Promise((resolve,reject)=>{
		let options = {
			scores:scores,
			variant:SmithWaterman
		};
		let thread = new swAlgoWebWorker(req.name, aTokens, bTokens, options);
		threads[req.name] = thread;
		thread.onmessage = function(msg){
			let handler = progHandler;
			switch(msg.type){
				// don't care
				case 'progress':
				case 'pause':
					handler = progHandler;
					break;
				// ERROR!! Post a message and then terminate processing
				case 'error':
				default:
					console.error('Unanticipated message returned from swAlgoWebWorker: ' + JSON.stringify(msg));
					thread.stop();
					break;
				// Done. Terminate processing
				case 'stop':
				case 'stopped':
				case 'complete':
					handler = resolve;
					thread.terminate();
					thread = null;
					delete threads[req.name];
					break;
			}
			if(msg.html){
				document.querySelector('pre').innerHTML = msg.html;
			}
			handler(msg);
		};
		thread.start();
	});


	performance.mark('smithwaterman-end.'+req.name);
	performance.measure('smithwaterman.'+req.name,'smithwaterman-start.'+req.name,'smithwaterman-end.'+req.name);
	let perf = performance.getEntriesByName('smithwaterman.'+req.name);
	notes.duration = perf.pop();

	if(endLists.type !== 'complete'){
		return null;
	}

	endLists = endLists.data;
	let results = await AlgorithmResults.Create(a, b, endLists.submissions[0], endLists.submissions[1], endLists.chains, notes);
	results.complete = results.totalTokens;

	return results;
}


})();
