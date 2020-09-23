'use strict';
export {
	Create,
	toJSON
};

import {TokenList} from '../token/TokenList.js';
import {checkNotNull,hasher} from '../util/misc.js';


/**
 * Construct results for a pairwise similarity detection algorithm.
 *
 * @param a First submission compared
 * @param b Second submission compared
 * @param finalListA Token list from submission A, with matched tokens set invalid
 * @param finalListB Token list from submission B, with matched tokens set invalid
 */
export default async function Create(a, b, finalListA = null, finalListB = null, chains = [], notes = null) {
	if(a.type === 'result'){
		return a;
	}

	checkNotNull(a);
	checkNotNull(b);

	let results = {};

	// Notes must be the very first thing applied since they are free form.
	// Free form means there is a risk that someone will overwrite a variable
	// we use for our calculations. The easiest way to resolve this is not to
	// put a bunch of error checking in the way, instead we let them set
	// anything they want, then we apply our variables to anythign we need to.
	// If we are sharing a variable, we will overwrite theirs.
	if(notes){
		Object.entries(notes).forEach(function(d){
			results[d[0]] = d[1];
		});
	}


	results.submissions = [
			{submission: a, finalList: finalListA},
			{submission: b, finalList: finalListB}
		]
		.map((d)=>{
			return {
				submission: d.submission.name,
				name : d.submission.name,
				totalTokens : d.submission.totalTokens,
				hash: d.submission.hash,
				finalList: d.finalList || d.submission.tokenList,
			};
		})
		.sort(function(a,b){
			let comp = a.submission.localeCompare(b.submission);
			return comp;
		})
		;

	results.hash = hasher(a.hash + b.hash);
	results.complete = 0;
	results.chains = chains;

	results.name = [];
	results.totalTokens = 0;
	results.percentMatched=0;
	for(let r = 0; r<results.submissions.length; r++){
		let d = results.submissions[r];
		if(!d.finalList){
			d.finalList = [];
		}
		if(Array.isArray(d.finalList) && !(d.finalList instanceof TokenList)){
			d.finalList = new TokenList('mixed',d.finalList);
		}
		d.finalList = await TokenList.cloneTokenList(d.finalList);
		d.totalTokens = await d.totalTokens;

		d.identicalTokens = 0;
		for(let c in chains){
			let chain = chains[c];
			if(!chain.submissions){
				console.error(`chains[${c}].submissions does not exist`);
				debugger;
			}
			d.identicalTokens += chain.submissions[r].tokens;
		}


		let pct = (d.totalTokens === 0) ? 0 : d.identicalTokens / d.totalTokens;
		d.percentMatched = pct;

		//results[String.fromCharCode(r+65)] = d;
		results.percentMatched += d.percentMatched;
		results.totalTokens += d.totalTokens;
		results.name.push(d.submission);
	}
	results.submissions.sort((a,b)=>{
		return b.percentMatched - a.percentMatched;
	});
	results.percentMatched /= results.submissions.length;
	results.name = results.name.sort().join('.');

	return results;
}

function toJSON(result){
	let json = JSON.clone(result);
	json.type = 'result';
	return json;
}
