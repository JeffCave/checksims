/**
 * DO NOT IMPLEMENT AS MODULE
 *
 * This class is referenced by a webworker, which means it *must* not be
 * implemented as a module until Firefox implements modules in webworkers.
 */
importScripts('../../../lib/psGpu.js');
importScripts('../swAlgoBase.js');

const utils = {
	defer: function(func){
		return new Promise((resolve,reject)=>{
			setTimeout(async ()=>{
				try{
					let result = await func();
					resolve(result);
				}
				catch(e){
					reject(e);
				}
			},32);
		});
	}
};

const modDir = [
		[0,0], // don't move
		[0,1],
		[1,0],
		[1,1]
	];

class swTiler extends SmithWatermanBase{
	constructor(name, a, b, opts){
		super(name, a, b, opts);

		if(!a && !b && name.name){
			a = name.submissions[0];
			b = name.submissions[1];
			name = name.name;
		}

		this.TileSize = swTiler.TileSize;

		this.name = name;
		this.submissions = [a,b].map((s)=>{
			s = { sub: s };
			s.tileLen = Math.ceil(a.length / this.TileSize);
			return s;
		});
		this.partial = new Map();
		this.matrix = [];
		this.chains = [];
		this.remaining = this.submissions[0].tileLen * this.submissions[1].tileLen;
		this.totalSize = this.remaining;
		this.partialProgress = 0;

		this.handlers = {
			progress:[],
			complete:[]
		};

		this.pause();
		this.addToTile(0,0,'nw',JSON.parse(swTiler.TileEdgeDefault).pop());
		this.start();
	}


	start(){
		if(this.isPaused === true){
			utils.defer(()=>{
				this.calcBuffer();
			});
		}
		this.isPaused = false;
	}

	stop(){
		this.pause();

		let msg = {type:'stopped',data:this.status};
		msg.data.chains = this.chains;
		msg.data.submissions = this.submissions;

		if(this.remaining === 0){
			msg.type = 'complete';
		}

		this.postMessage(msg);
		this.destroy();
	}

	destroy(){
	}

	progress(){
		this.postMessage({type:'progress', data:this.toJSON()});
	}

	get status(){
		let tilesize = this.TileSize**2;
		let partial = Math.floor(tilesize * this.partialProgress);

		let s = super.status;
		s.totalSize *= tilesize;
		s.remaining *= tilesize;
		s.remaining -= partial;
		return s;
	}

	async addToTile(x,y,origin,chain){
		// bounds checking
		if(x < 0 || y < 0){
			return false;
		}
		if(x >= this.submissions[0].tileLength || y >= this.submissions[1].tileLength){
			return false;
		}
		// lookup the data at that location
		let index = this.CoordToIndex(x,y);
		let cell = this.partial.get(index);
		if(!cell){
			// create it if necessary
			cell = {
				id:[x,y],
			};
			this.partial.set(index,cell);
		}

		// have we already processed this value?
		if(origin in cell){
			return false;
		}

		// initialize values that exist at the begining of the world
		if(x === 0){
			cell.w = JSON.parse(swTiler.TileEdgeDefault);
		}
		if(y === 0){
			cell.n = JSON.parse(swTiler.TileEdgeDefault);
		}
		if(x === 0 || y === 0){
			cell.nw = JSON.parse(swTiler.TileEdgeDefault).pop();
		}

		// set the values
		cell[origin] = chain;

		// have we calcuated up the three pre-requisites sufficiently to
		// solve the problem?
		if('n' in cell && 'w' in cell && 'nw' in cell){
			// take it out of the pre-processing queue, and add it to the
			// processing queue
			this.partial.delete(index);
			this.matrix.push(cell);
		}

		// if the pre-processing queue is empty, do the actual calcuations
		if(this.partial.size === 0){
			this.calcBuffer();
		}

		return cell;
	}


	async calcBuffer(){
		this.calcBufferInstance = this.calcBufferInstance || utils.defer(async ()=>{

			// this thing is supposed to be a multi-threaded thing. We may need
			// a way to stop it
			if(this.isPaused){
				return false;
			}

			let tile = this.matrix.shift();
			if(tile){
				tile = await this.calcTile(tile);
				this.remaining--;
				this.progress();
				// schedule the next processing cycle
				this.calcBuffer();
			}
			else{
				this.stop();
			}

			this.calcBufferInstance = null;
			return tile;
		});

		return this.calcBufferInstance;
	}


	async calcTile(tile){

		let lexememap = {enc:{},dec:[]};

		let segs = [{},{}];
		for(let s=0; s<segs.length; s++){
			let seg = segs[s];
			let sub = this.submissions[0].sub;
			seg.start = tile.id[s] * this.TileSize;
			seg.fin = seg.start + this.TileSize;
			// TODO: Investigate potential one off
			//seg.fin = Math.min(sub.length,seg.fin) - 1;
			seg.fin = Math.min(sub.length,seg.fin);
			seg.segment = sub.slice(seg.start,seg.fin);
			for(let i=0; i<seg.segment.length; i++){
				let val = seg.segment[i];
				val = val.lexeme;
				if(!(val in lexememap.enc)){
					lexememap.enc[val] = lexememap.dec.length;
					lexememap.dec.push(val);
				}
				seg.segment[i].lexeme = lexememap.enc[val];
			}
		}

		tile.lexememap = lexememap;
		tile.segments = segs;
		let p = new Promise((resolve)=>{
			let id = this.name + JSON.stringify(tile.id);
			let a = segs[0].segment;
			let b = segs[1].segment;
			let opts = {};
			let gpu = new swAlgoGpu(id,a,b,opts);
			gpu.addEventListener('msg', (msg)=>{
				msg = msg.detail;
				if(msg.type === 'stopped'){
					let c = gpu.finishedChains;
					resolve(c);
				}
				else if (msg.type ==='progress'){
					this.partialProgress  = msg.data.totalSize;
					this.partialProgress -= msg.data.remaining;
					this.partialProgress /= msg.data.totalSize;
					this.progress();
				}
			});
			gpu.start();
		});
		try{
			tile.finishedChains = await p;
		}
		catch(e){
			console.error(e);
		}

		return tile;
	}

	CoordToIndex(x,y){
		return y * this.submissions[0].tileLen + x;
	}

	IndexToCoord(i){
		let len =this.submissions[0].tileLen;
		let x = i/len;
		let y = i%len;
		return [x,y];
	}

}
//swTiler.TileSize = (2**(16-1)) - 2;
swTiler.TileSize = 600;
swTiler.TileEdgeDefault = new Array(swTiler.TileSize)
	.fill(0)
	.map(()=>{
		return {score:0,chain:[],highscore:Number.MIN_SAFE_INTEGER};
	});
swTiler.TileEdgeDefault = JSON.stringify(swTiler.TileEdgeDefault);

// ---------------------------------------------------------------- //

class swAlgoGpu extends SmithWatermanBase{
	constructor(name, a, b, opts){
		super(name,a,b,opts);
		if(!a && !b && name.name){
			a = name.submissions[0];
			b = name.submissions[1];
			name = name.name;
		}
		this.matrix = [];
		this.partial = new Map();
		this.finishedChains = [];

		this.name = name;
		this.submissions = [a,b];

		this.cycles = a.length + b.length - 1;
		this.remaining =
			// initialization loop and write to GPU
			a.length + b.length + 1 +
			// apply initial score if values equal each other
			1 +
			// the number of cycles to calculate the space
			this.cycles +
			// number of cycles to process the chains
			(a.length * b.length) +
			0;
		this.totalSize = this.remaining;

		this.handlers = {
			progress:[],
			complete:[]
		};

		this.pause();

		this.gpu = new psGpu({width:a.length,height:b.length});
		this.gpu.addProgram('smithwaterman', gpuFragSW);
		this.gpu.addProgram('initializeSpace', gpuFragInit);
		this.gpu.initMemory();

		let data = this.gpu.emptyData();
		let data16 = new Uint16Array(data.buffer);
		for(let x=0,pos=0; x < this.gpu.width; x++,pos+=2){
			data16[pos] = this.submissions[0][x].lexeme;
			this.remaining--;
		}
		this.postMessage({type:'progress', data:this.toJSON()});
		for(let y=0,pos=1; y < this.gpu.height; y++,pos+=(this.gpu.width*2)){
			data16[pos] = this.submissions[1][y].lexeme;
			this.remaining--;
		}
		this.postMessage({type:'progress', data:this.toJSON()});
		// Write the values to the image
		this.gpu.write(data);
		this.remaining--;
		this.postMessage({type:'progress', data:this.toJSON()});
		this.gpu.run('initializeSpace');
		this.remaining--;
		this.postMessage({type:'progress', data:this.toJSON()});
	}

	destroy(){
		if(this.gpu){
			this.gpu.destroy();
			this.gpu = null;
			delete this.gpu;
		}
	}

	get remaining(){
		if(this._.remaining < 0){
			this._.remaining = 0;
		}
		return this._.remaining;
	}
	set remaining(value){
		this._.remaining = value;
	}

	start(){
		if(this.isPaused === true){
			utils.defer(()=>{
				this.calc();
			});
		}
		this.isPaused = false;
	}

	stop(){
		if(!this.gpu) return;

		this.pause();
		let chains = this.ResolveCandidates();

		let msg = {type:'stopped',data:this.status};
		msg.data.chains = chains;
		msg.data.submissions = this.submissions;

		if(this.remaining === 0){
			msg.type = 'complete';
		}

		this.postMessage(msg);
		this.destroy();
	}

	pause(){
		this.isPaused = true;
		this.postMessage({type:'pause'});
	}



	calc(){
		let timeLimit = Date.now() + 100;
		while(timeLimit > Date.now()){
			for(let limit = 100; limit >= 0 && this.cycles > 0; limit--, this.cycles--){
				//this.postMessage({type:'progress', data:this.toJSON()});
				this.gpu.run('smithwaterman');
				//this.postMessage({type:'progress', data:this.toJSON()});
				this.remaining--;
			}
		}

		// Periodically report it up
		let msg = {type:'progress', data:this.toJSON()};
		this.postMessage(msg);

		if(this.cycles > 0){
			utils.defer(()=>{
				this.calc();
			});
		}
		else{
			this.stop();
		}
	}

	ResolveCandidates(){
		if(this._chains) return this._chains;

		// Copy values out of the GPU data into a JS array, but skip anything
		// that did not get a score at all.
		let values = this.gpu.read();
		let index = new Map();
		for(let i=values.length-4; i>=0; i-=4){
			let d = {
				i:i,
				dir: values[i+1]
			};

			d.score = new Uint16Array(values.buffer,i,2);
			d.score = d.score[1];

			if(d.score > 0){
				index.set(d.i, d);
			}
			else{
				this.remaining--;
			}
		}
		values = null;

		this.remaining = index.size;
		this.postMessage({type:'progress', data:this.toJSON()});

		/*
		* Now for the fun part
		*/
		let resolved = [];
		let chain = {score:Number.MAX_VALUE};
		this.resetShareMarkers();

		while(index.size > 0 && resolved.length < this.MaxChains && chain.score >= this.ScoreSignificant){
			chain = Array.from(index.values())
				.sort((a,b)=>{
					let ord = b.score - a.score;
					if(ord === 0){
						ord = a.i - b.i;
					}
					return ord;
				})
				.shift()
				;
			if(!chain.score){
				index.delete(chain.i);
				console.warn('This should never happen');
				continue;
			}
			this.remaining = index.size;
			this.postMessage({type:'progress', data:this.toJSON()});

			// walk the chain checking for coordinates we have already assigned
			// to a previous chain
			chain.history = [];
			for(let item = chain; item; item = index.get(item.prev)){
				chain.history.push(item);
				index.delete(item.i);

				item.x = Math.floor(item.i/4)%this.gpu.width;
				item.y = Math.floor(Math.floor(item.i/4)/this.gpu.width);

				/*
				 * If the character was already used by a previous chain, it
				 * means this chain can't have it, and we have broken our chain
				 */
				let a = this.submissions[0][item.x];
				let b = this.submissions[1][item.y];
				if(a.shared || b.shared){
					item.prev = -1;
					continue;
				}
				// this element belongs to this chain, indicate that future
				// chains should not use it
				a.shared = resolved.length;
				b.shared = resolved.length;


				// map the next node in the chain
				let md = modDir[item.dir%modDir.length];
				item.prev = item.i;
				item.prev -= md[0] * 1 * 4;
				item.prev -= md[1] * this.gpu.width * 4;
			}

			let PushChain = (chain)=>{
				let finItem = chain.history[chain.history.length-1];
				chain.score -= Math.max(0,finItem.score-this.ScoreMatch);
				if(chain.score >= this.ScoreSignificant){
					resolved.push(chain);
				}
			};

			PushChain(chain);
		}
		this.postMessage({type:'progress', data:this.toJSON()});
		index.clear();
		resolved = resolved
			.sort((a,b)=>{
				let ord = b.score - a.score;
				if(ord === 0){
					ord = a.i - b.i;
				}
				return ord;
			})
			.slice(0,Math.min(this.MaxChains,resolved.length))
			;
		// we removed a bunch of chains, but may have marked lexemes as shared.
		// they aren't anymore, so re-run the entire "shared" markers
		this.resetShareMarkers();
		for(let c=1; c<=resolved.length; c++){
			let chain = resolved[c-1];
			chain.id = c;
			chain.submissions = [{tokens:0,blocks:[]},{tokens:0,blocks:[]}];
			let history = chain.history;
			for(let i=0; i<history.length; i++){
				delete history[i].history;
				history[i] = JSON.parse(JSON.stringify(history[i]));
				let coords = history[i];
				let a = this.submissions[0][coords.x];
				let b = this.submissions[1][coords.y];
				if(!a.shared){
					a.shared = c;
					chain.submissions[0].tokens++;
				}
				if(!b.shared){
					b.shared = c;
					chain.submissions[1].tokens++;
				}

				let segA = chain.submissions[0].blocks[0];
				if(!segA || segA.path !== a.range[2]){
					segA = {
						path: a.range[2],
						start: Number.POSITIVE_INFINITY,
						end: Number.NEGATIVE_INFINITY,
					};
					chain.submissions[0].blocks.unshift(segA);
				}
				segA.start = Math.min(a.range[0], segA.start);
				segA.end   = Math.max(a.range[1], segA.end);

				let segB = chain.submissions[1].blocks[0];
				if(!segB || segB.path !== b.range[2]){
					segB = {
						path: b.range[2],
						start: Number.POSITIVE_INFINITY,
						end: Number.NEGATIVE_INFINITY,
					};
					chain.submissions[1].blocks.unshift(segB);
				}
				segB.start = Math.min(b.range[0], segB.start);
				segB.end   = Math.max(b.range[1], segB.end);
			}
			chain.submissions[0].blocks.reverse();
			chain.submissions[1].blocks.reverse();
			chain.history = history;
		}
		this.postMessage({type:'progress', data:this.toJSON()});

		this.remaining = 0;
		this._chains = resolved;
		return resolved;
	}


	get html(){
		//if(this._html && this._htmlN >= 2){
		//	return this._html;
		//}
		if(!this.gpu){
			return this._html || '';
		}

		function format(val){
			val = "\u00a0\u00a0\u00a0" + val;
			val = val.split('').reverse().slice(0,3).reverse().join('');
			return val;
		}

		let val = this.gpu.read();
		let values = Array.from(val).map(d=>{
			return format(d);
		});
		let v = 0;

		let table = [];
		let row = ['&nbsp;'];
		for(let c=0; c<this.gpu.width; c++){
			row.push(this.submissions[0][c].lexeme + '<sub>['+c+']</sub>');
		}
		table.push(row.map((d,i)=>{return '<th>'+d+'</th>';}).join(''));

		for(let r=0; r<this.gpu.height && v<values.length; r++){
			let row = [this.submissions[1][r].lexeme+'<sub>['+r+']</sub>'];
			for(let c=0; c<this.gpu.width && v<values.length; c++){
				let cell = [
					[values[v+0]-127,values[v+1]].join('&nbsp;'),
					[values[v+2]    ,values[v+3]].join('&nbsp;'),
					'<sub>['+[r,c].join(',')+']</sub>',
				].join('\n');
				v += 4;
				row.push(cell);
			}
			table.push(row.map((d)=>{return '<td style="border:1px solid black;">'+d+'</td>';}).join(''));
		}
		table = table.join('</tr><tr>');

		this._html = "<table style='border:1px solid black;'><tr>"+table+"</tr></table>";
		this._htmlN = (this._htmlN || 0) +1;

		return this._html;
	}

}

const gpuFragInit = (`
	precision mediump float;

	// our texture
	uniform sampler2D u_image;
	// the texCoords passed in from the vertex shader.
	varying vec2 v_texCoord;

	// constants
	uniform vec2 u_resolution;
	uniform vec4 scores;

	void main() {
		vec4 w = texture2D(u_image, vec2(v_texCoord.x,0));
		vec4 n = texture2D(u_image, vec2(0,v_texCoord.y));
		float score = 0.0;
		w *= 255.0;
		n *= 255.0;
		// exact match
		//TODO: There is a bug visible in the 'bellican/coelicanth' compare where (4 == 3)
		if(int(w.r) == int(n.b) && int(w.g) == int(n.a)){
			score = scores.x;
		}
		// a mis-match
		else{
			score = scores.y;
		}
		gl_FragColor = vec4(score,0,score,0);
	}
`);


const gpuFragSW = (`
	precision mediump float;

	// our texture
	uniform sampler2D u_image;
	// the texCoords passed in from the vertex shader.
	varying vec2 v_texCoord;

	// constants
	uniform vec2 u_resolution;
	uniform vec4 scores;

	/*******************************************************
	 * Encode values across vector positions
	 *
	 * https://stackoverflow.com/a/18454838/1961413
	 */
	const vec4 bitEnc = vec4(255.0, 65535.0, 16777215.0, 4294967295.0);
	const vec4 bitDec = 1.0/bitEnc;
	vec4 EncodeFloatRGBA (float v) {
		vec4 enc = bitEnc * v;
		enc = fract(enc);
		enc -= enc.yzww * vec2(1.0/255.0, 0.0).xxxy;
		return enc;
	}
	float DecodeFloatRGBA (vec4 v) {
		return dot(v, bitDec);
	}
	/* https://stackoverflow.com/a/18454838/1961413
	 *
	 *******************************************************/


	void main() {
		int dir = 0;

		vec4 scoresExpanded = (scores*bitEnc.x)-127.0;
		// calculate the size of a pixel
		vec2 pixSize = vec2(1.0, 1.0) / u_resolution;
		vec4 pixNull = vec4(0.0,0.0,0.0,0.0);

		// find our four critical points
		vec4 here = texture2D(u_image, v_texCoord);
		vec4 nw   = texture2D(u_image, v_texCoord + vec2(-pixSize.x,-pixSize.y));
		vec4 w    = texture2D(u_image, v_texCoord + vec2(-pixSize.x,         0));
		vec4 n    = texture2D(u_image, v_texCoord + vec2(         0,-pixSize.y));

		// test for out of bounds values
		if(v_texCoord.y <= pixSize.y){
			nw = pixNull;
			n = pixNull;
		}
		if(v_texCoord.x <= pixSize.x){
			nw = pixNull;
			w = pixNull;
		}

		/*******************************/
		// Get the running terminus

		vec4 term  = vec4(0.0, n.g, w.g, nw.g);
		term = floor((term * bitEnc.x) / 4.0);

		// Find the max score from the chain
		float nwScore = (nw.b*bitEnc.x) + (nw.a*bitEnc.y);
		float wScore  = ( w.b*bitEnc.x) + ( w.a*bitEnc.y);
		float nScore  = ( n.b*bitEnc.x) + ( n.a*bitEnc.y);
		vec4 score = vec4(0.0, nScore, wScore, nwScore);

		// pick the biggest of the highest score
		score.x = max(score.x, score[1]);
		score.x = max(score.x, score[2]);
		score.x = max(score.x, score[3]);

		// Figure out what the directionality of the score was
		if(int(score.x) == int(score[3])){
			dir = 3;
			term.x = term[3];
		}
		else if(int(score.x) == int(score[2])){
			dir = 2;
			term.x = term[2];
		}
		else{
			dir = 1;
			term.x = term[1];
		}
		term.y = score.x;


		// apply the skip penalty (we already removed it if it was NW)
		if(dir != 3){
			score.x += scoresExpanded.z;
		}
		// add up our new score
		score.x += (here.r*bitEnc.x)-127.0;

		// clamp it to Zero
		score.x = max(score.x , 0.0);
		score.x = min(score.x , bitEnc.y);

		// calcuate ther termination value
		term.y -= score.x;
		term.x += term.y;
		if(term.y < 0.0){
			term.x = 0.0;
		}
		if(term.x > score.w){
			score.x = 0.0;
			term.x = 0.0;
		}

		// place the result in the last two registers
		here.b = score.x - (here.a*256.0);
		here.a = floor(score.x / 256.0);

		// encode the directionality and terminus in a single register
		// direction
		here.g = float(dir);
		here.g /= 4.0;
		here.g -= floor(here.g);
		here.g *= 4.0;
		// terminus
		here.g += floor(term.x) * 4.0;

		here.gba = here.gba / bitEnc.x;
		/*******************************/

		gl_FragColor = here;
	}
`);


/**
 * Can you distinguish between Shit and Shinola?
 *
 * https://www.neatorama.com/2014/02/11/Spectroscopic-Discrimination-of-Shit-from-Shinola/
 *
 * Apparently, it is actually very difficult to distinguish between the two
 * using only the human eye, though a spectromitor can easily distinguish
 * between the two.
 */


let matrix = null;



onmessage = function(params){
	if(matrix === null && params.data.action === 'start') {
		console.log("Initializing web worker");

		let id = params.data.name;
		let a = params.data.submissions[0];
		let b = params.data.submissions[1];
		let opts = params.data.options;

		matrix = new swTiler(id,a,b,opts);
		matrix.addEventListener('msg',(msg)=>{
			msg = msg.detail;
			postMessage(msg);
		});
	}
	if(matrix !== null){
		if(params.data.action === 'start'){
			console.log("Starting web worker");
			matrix.start();
		}
		else if(params.data.action === 'pause'){
			matrix.pause();
		}
		else if(params.data.action === 'stop'){
			matrix.stop();
		}
	}
};
