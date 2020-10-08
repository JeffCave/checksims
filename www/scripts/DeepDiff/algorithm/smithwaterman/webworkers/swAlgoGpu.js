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

const VERT = 0;
const HORIZ = 1;
const DIAG = 2;

class swTiler extends SmithWatermanBase{
	constructor(name, a, b, opts){
		super(name, a, b, opts);

		if(!a && !b && name.name){
			a = name.submissions[VERT];
			b = name.submissions[HORIZ];
			name = name.name;
		}

		this.TileSize = swTiler.TileSize;

		this.name = name;
		this.submissions = [a,b].map((s)=>{
			s = { sub: s };
			s.tileLen = a.length / this.TileSize;
			//s.tileLen = s.tileLen - 1;
			s.tileLen = Math.ceil(s.tileLen);
			return s;
		});
		this.partial = new Map();
		this.matrix = [];
		this.chains = new Map();
		this.remaining = this.submissions[VERT].tileLen * this.submissions[HORIZ].tileLen;
		this.totalSize = this.remaining;
		this.partialProgress = 0;

		this.handlers = {
			progress:[],
			complete:[]
		};

		this.pause();
		this.addToTile(0,0,'nw',JSON.parse(swTiler.TileEdgeDefault).pop());
		this.calcBuffer();
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

		let chains = this.ResolveCandidates();
		chains = chains.sort((a,b)=>{return b.score-a.score;});
		chains = chains.slice(0,100);

		let msg = {type:'stopped',data:this.status};
		msg.data.chains = chains;
		msg.data.submissions = this.submissions.map((d)=>{ return d.sub; });

		if(this.remaining === 0){
			msg.type = 'complete';
		}

		this.postMessage(msg);
		this.destroy();
	}

	destroy(){
	}

	progress(extra={}){
		let data = this.toJSON();
		data = Object.assign(data,extra);
		this.postMessage({type:'progress', data:data});
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

	/**
	 * Initializes the edge of a tile with scores from preceding tiles.
	 *
	 * When generating a tile, it is necessary to initialize the edges
	 * of the tile with scores from the parent tiles (north, west, and
	 * north-west). This allows the score calculated on the tile's elements
	 * to pick up wehre the preceding tile left of.
	 *
	 * The position of the tile in the overall matrix (horizontal,
	 * vertical) must be specified.
	 *
	 * Chains are also included so that they can initialize the edges.
	 *
	 * @param {*} horizontal
	 * @param {*} vertical
	 * @param {*} origin
	 * @param {*} chain
	 */
	async addToTile(horizontal,vertical,origin,chains=[]){
		// bounds checking
		if(vertical < 0 || horizontal < 0){
			return false;
		}
		let isInBounds =
			vertical < this.submissions[VERT].tileLen &&
			horizontal < this.submissions[HORIZ].tileLen
			;
		if(!isInBounds){
			while(chains.length > 0) {
				let val = chains.pop();
				if(val.highscore > Number.MIN_SAFE_INTEGER){
					this.chains.set(val.i,val);
				}
			}
			return false;
		}
		// lookup the data at that location
		let x = horizontal;
		let y = vertical;
		let index = this.CoordToIndex(x,y);
		let cell = this.partial.get(index);
		if(!cell){
			// create it if necessary
			cell = {id:[vertical,horizontal]};
			this.partial.set(index,cell);
		}

		// have we already processed this value?
		if(origin in cell){
			return false;
		}

		// initialize values that exist at the begining of the world
		if(!cell.n && vertical === 0){
			cell.n = JSON.parse(swTiler.TileEdgeDefault);
		}
		if(!cell.w && horizontal === 0){
			cell.w = JSON.parse(swTiler.TileEdgeDefault);
		}
		if(!cell.nw && (vertical === 0 || horizontal === 0)){
			cell.nw = JSON.parse(swTiler.TileEdgeDefault).pop();
		}

		cell[origin] = chains;

		// have we calcuated up the three pre-requisites sufficiently to
		// solve the problem?
		if('n' in cell && 'w' in cell && 'nw' in cell){
			// take it out of the pre-processing queue, and add it to the
			// processing queue
			this.partial.delete(index);
			this.matrix.push(cell);
		}

		return cell;
	}

	/**
	 * Iterates the tile buffer, calculating each tile
	 *
	 * In order to minimize the amount of memory in use, this iteration
	 * is implemented as a buffer. As processing is done against a 2D
	 * matrix, with items being completed in a diagonal fashion, some
	 * retension of "completed" tiles is necessary to feed their data
	 * down the processing chain (the "buffer" rather than a "matrix").
	 *
	 * Because this can result in large memory storage, tiles that have
	 * been completely used are released, while the next tiles are created
	 * on demand. This function manages the creation, release, and transition
	 * of data (a pipeline).
	 *
	 * Another way to think of this function is that it orchestrates `addToTile`
	 * (run three times as the neighbors are completed) and `calcTile`
	 * (run once all three edges have been supplied).
	 *
	 * In order to allow this to run in a multi-threaded fashion, this
	 * function does not directly return its results, but rather fills
	 * a `chains` bucket as it works. It also does not run in a loop,
	 * rather starts a new instance of itself for each tile, allowing
	 * for it to be stopped by the class.
	 *
	 * @param {bool} force
	 */
	async calcBuffer(force = false){
		if(force) this.calcBufferInstance = null;
		this.calcBufferInstance = this.calcBufferInstance || utils.defer(async ()=>{

			// this thing is supposed to be a multi-threaded thing. We may need
			// a way to stop it
			if(this.isPaused){
				return false;
			}

			let tile = this.matrix.shift();
			if(tile){
				tile = await this.calcTile(tile);
				// We have received a bunch of chains from the tile, some of
				// them will be complete, and some of them will have gone right
				// up to the edges. These chains need to be sorted into three
				// groups:
				//
				//  1. finished chains
				//  2. chains touching the east edge
				//  3. chains touching the south edge
				//  4. chain touching the corner
				let chains = tile.finishedChains.slice();
				let unfinished = [[],[],[]];
				for(let chain = chains.pop(); chain; chain = chains.pop()){
					let vMatch = null;
					let hMatch = null;

					let last = chain.history[chain.history.length-1];
					vMatch = last.y === tile.segments[VERT].start;
					hMatch = last.x === tile.segments[HORIZ].start;
					if(vMatch || hMatch){
						let link = this.chains.get(chain.i);
						if(link){
							this.chains.delete(link);
							chain.history = chain.history.concat(link);
						}
					}

					vMatch = chain.y === tile.segments[VERT].fin;
					hMatch = chain.x === tile.segments[HORIZ].fin;
					if(vMatch && hMatch){
						unfinished[DIAG].push(chain);
					}
					else if(vMatch){
						unfinished[VERT].push(chain);
					}
					else if(hMatch){
						unfinished[HORIZ].push(chain);
					}
					else{
						this.chains.set(chain.i,chain);
					}
				}


				let nw = unfinished[DIAG].pop();
				if(!nw){
					nw = JSON.parse(swTiler.TileEdgeDefault).pop();
				}
				nw = [nw];
				let w  = JSON.parse(swTiler.TileEdgeDefault);
				for(let loc of unfinished[HORIZ]){
					w[loc.y] = loc;
				}
				let n  = JSON.parse(swTiler.TileEdgeDefault);
				for(let loc of unfinished[VERT]){
					n[loc.x] = loc;
				}

				let x = tile.id[HORIZ], y = tile.id[VERT];
				this.addToTile( x+1 , y   , 'w' , w  );
				this.addToTile( x+1 , y+1 , 'nw', nw );
				this.addToTile( x   , y+1 , 'n' , n  );

				this.remaining--;
				this.progress();
				// schedule the next processing cycle
				this.calcBuffer(true);

			}
			else{
				this.stop();
			}

			this.calcBufferInstance = null;
			return tile;
		});

		return this.calcBufferInstance;
	}


	/**
	 * As we are dividing the GPU work into something manageable (memory
	 * explosion) we need to send the subset of work to the GPU processor.
	 * Results that are returned need to have their subset coordinates
	 * re-mapped to the larger chain sets.
	 *
	 * For example, if tiles are 1024*1024 in size, and the larger comparison
	 * has 10*10 tiles, coordinates [10,10] in tile [2,2] coorispond to
	 * global coordinates of [2058,2058] (1024*2+10).
	 *
	 * This function returns the list of chains associated with the tile,
	 * with global (rather than local) coordinates. The function is constrained
	 * to knowledge of the *this* tile, therefore these chains are not
	 * linked to global chains.
	 *
	 * In the case there is a chain that crosses tile boundaries, chains
	 * that are generated by this function will need to be linked to them.
	 * However, as an optimization, tiles are seeded with starting chain
	 * values (see `addToTile`), therefore the element `scores` will be
	 * correct.
	 *
	 * @param {swTile} tile
	 * @returns {array<chains>} Resulting tile chains
	 */
	async calcTile(tile){

		let lexememap = {enc:{},dec:[]};

		let segs = [{},{}];
		for(let s=0; s<segs.length; s++){
			let seg = segs[s];
			let sub = this.submissions[s].sub;
			seg.start = tile.id[s] * this.TileSize;
			seg.fin = seg.start + this.TileSize - 1;
			// TODO: Investigate potential one off
			//seg.fin = Math.min(sub.length,seg.fin) - 1;
			seg.fin = Math.min(sub.length,seg.fin);
			seg.segment = sub.slice(seg.start,seg.fin+1);
			for(let i=seg.segment.length-1; i>=0; i--){
				let val = seg.segment[i];
				val = JSON.parse(JSON.stringify(val));
				seg.segment[i] = val;
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
			let v = segs[VERT].segment;
			let h = segs[HORIZ].segment;
			let opts = {};
			let gpu = new swAlgoGpu(id,v,h,opts);
			gpu.addEventListener('msg', (msg)=>{
				msg = msg.detail;
				if(msg.type === 'complete'){
					let c = msg.data.chains;
					resolve(c);
				}
				else if (msg.type ==='progress'){
					this.partialProgress  = msg.data.totalSize;
					this.partialProgress -= msg.data.remaining;
					this.partialProgress /= msg.data.totalSize;
					let html = {};
					if(msg.data.html){
						html = {html:msg.data.html};
					}
					this.progress(html);
				}
			});
			gpu.start();
		});
		try{
			tile.finishedChains = await p;
			let width = this.submissions[HORIZ].sub.length;
			let horiz = tile.id[HORIZ] * this.TileSize;
			let vert  = tile.id[VERT ] * this.TileSize;
			for(let chain of tile.finishedChains){
				chain.x = horiz + chain.x;
				chain.y = vert  + chain.y;
				chain.i = (chain.y * width) + chain.x;
				for(chain of chain.history){
					chain.x = horiz + chain.x;
					chain.y = vert  + chain.y;
					chain.i = (chain.y * width) + chain.x;
				}
			}
		}
		catch(e){
			console.error(e);
		}

		return tile;
	}

	ResolveCandidates(){
		if(this._chains) return this._chains;

		// Copy values out of the chains into a master pool
		let index = new Map();
		for(let chain of this.chains){
			chain = chain.pop();
			if(chain.score < this.ScoreSignificant){
				continue;
			}
			let last = null;
			for(let value of chain.history){
				delete value.prev;
				index.set(value.i, value);
				if(last && last.i > value.i){
					last.prev = value;
				}
				last = value;
			}
		}

		this.remaining = index.size;
		//this.postMessage({type:'progress', data:this.toJSON()});

		// This bugs me. There has got to be a way to pre-index this
		// by score to allow us to rapidly find the best candidate.
		//
		// Its wrong too.
		//
		// We don't want to start with the highest score, we want
		// to start with the last item in a chain, and make sure
		// it is the one that moves down the ... I just don't know
		// ... but its wrong
		function chaincompare(a,b){
			let ord = a.score - b.score;
			if(ord === 0){
				ord = b.i - a.i;
			}
			return ord;
		}
		let chainstarts = Array.from(index.values()).sort(chaincompare);

		/*
		* Now for the fun part
		*
		* resolved - the list of chains that actually exist
		*/
		let resolved = [];
		let chain = {score:Number.MAX_VALUE};
		const ScoreSignificant = this.ScoreSignificant;
		while(chainstarts.length > 0 && chain.score >= ScoreSignificant){
			chain = chainstarts.pop();
			if(! index.has(chain.i)){
				// This would indicate that the item we retrieved from the sorted
				// array was removed from the master index. That means it was
				// part of a prior chain. In this case, we should start a new chain
				// from the point of intersection. To find the point of
				// instersection, we search the chain's history for the first item
				// that is still in the pool.
				for(let link = chain.prev; link; link = link.prev){
					if(! index.has(link.i)) continue;
					if(link.score >= this.ScoreSignificant){
						chainstarts.push(link);
						// naturally, the item we have just injected has a score 
						// that will fix its position, so we need to re-sort the array
						//
						// if this happens a lot, we should search the array for the 
						// insertion point ourselves, and then use `splice`. I'm not 
						// convinced this happens frequently enough to warrant the change.
						chainstarts = chainstarts.sort(chaincompare);
					}
					break;
				}
				continue;
			}
			this.remaining = index.size;
			this.postMessage({type:'progress', data:this.toJSON()});

			// construct the chain's history
			let item = null;
			chain = Object.assign(chain,{submissions:[{},{}]});
			for(item = chain; item; item=item.prev||{i:null},item=index.get(item.i)){
				delete item.history;
				item.pos = [item.x,item.y];
				chain.submissions[0][item.x] = item.y;
				chain.submissions[1][item.y] = item.x;
				index.delete(item.i);
			}
			/*
			 * The chain needs a couple of values calculated for convenience:
			 * - The mapping, which is a list of the position and its corresponding location on the other submission
			 * - Tokens: a count of the number of intersection locations (should be teh same as last-first?)
			 * - first/last: the start and end position on the string
			 */
			chain.submissions = chain.submissions.map(d=>{
				let sub = {
					mapping: d,
					tokens: Object.values(d).length,
					first: Math.min(... Object.keys(d)),
					last: Math.max(... Object.keys(d)),
				};
				return sub;
			});
			chain = {
				submissions: chain.submissions,
				score: chain.score,
				id: chain.i,
			};
			item = null;

			/* 
			 * We already know that this is going to have a signficant score. 
			 * We checked that when determining if it should be considered teh 
			 * start of a chain. 
			 */
			//if(chain.score >= this.ScoreSignificant){
			//	resolved.push(chain);
			//}
			resolved.push(chain);
		}
		this.postMessage({type:'progress', data:this.toJSON()});
		index.clear();
		this.postMessage({type:'progress', data:this.toJSON()});
		this.remaining = 0;
		this._chains = resolved;
		return resolved;
	}


	CoordToIndex(x,y){
		return y * this.submissions[VERT].tileLen + x;
	}

	IndexToCoord(i){
		let len =this.submissions[VERT].tileLen;
		let x = i/len;
		let y = i%len;
		return [x,y];
	}

}
swTiler.TileSize = 1024; //(2**(16-1)) - 2;
// turn size in to a power of two value to keep shaders happy
swTiler.TileSize = Math.pow(Math.floor(Math.pow(swTiler.TileSize,0.5)),2);
swTiler.TileEdgeDefault = new Array(swTiler.TileSize)
	.fill(0)
	.map(()=>{
		return {score:0,chain:[],highscore:Number.MIN_SAFE_INTEGER};
	});
swTiler.TileEdgeDefault = JSON.stringify(swTiler.TileEdgeDefault);

// ---------------------------------------------------------------- //

class swAlgoGpu extends SmithWatermanBase{
	constructor(name, v, h, opts){
		super(name,v,h,opts);
		if(!v && !h && name.name){
			v = name.submissions[VERT];
			h = name.submissions[HORIZ];
			name = name.name;
		}
		this.matrix = [];
		this.partial = new Map();
		this.finishedChains = [];

		this.name = name;
		this.submissions = [];
		this.submissions[VERT] = v;
		this.submissions[HORIZ] = h;

		this.cycles = v.length + h.length - 1;
		this.remaining =
			// initialization loop and write to GPU
			v.length + h.length + 1 +
			// apply initial score if values equal each other
			1 +
			// the number of cycles to calculate the space
			this.cycles +
			// number of cycles to process the chains
			(v.length * h.length) +
			0;
		this.totalSize = this.remaining;

		this.handlers = {
			progress:[],
			complete:[]
		};

		this.pause();

		this.gpu = new psGpu({width:h.length,height:v.length});
		this.gpu.addProgram('smithwaterman', gpuFragSW);
		this.gpu.addProgram('initializeSpace', gpuFragInit);
		this.gpu.initMemory();

		let data = this.gpu.emptyData();
		let data16 = new Uint16Array(data.buffer);
		for(let i=0,pos=0; i < this.gpu.width; i++,pos+=2){
			data16[pos] = this.submissions[HORIZ][i].lexeme;
		}
		this.remaining-=this.gpu.width;
		this.postMessage({type:'progress', data:this.toJSON()});
		for(let i=0,pos=1; i < this.gpu.height; i++,pos+=(this.gpu.width*2)){
			data16[pos] = this.submissions[VERT][i].lexeme;
		}
		this.remaining-=this.gpu.height;
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

	//toJSON(){
	//	let json = super.toJSON();
	//	json.html = this.html;
	//	return json;
	//}

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
			d.terminus = Math.floor(d.dir / 4);
			d.dir = d.dir % 4;

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
		*
		* resolved - the list of chains that actually exist
		*/
		let resolved = [];
		let chain = {score:Number.MAX_VALUE};
		// This bugs me. There has got to be a way to pre-index this
		// by score to allow us to rapidly find the best candidate.
		//
		// Its wrong too.
		//
		// We don't want to start with the highest score, we want
		// to start with the last item in a chain, and make sure
		// it is the one that moves down the ... I just don't know
		// ... but its wrong
		let chainstarts = Array.from(index.values())
			.sort((a,b)=>{
				let ord = a.score - b.score;
				if(ord === 0){
					ord = b.i - a.i;
				}
				return ord;
			});

		while(index.size > 0 && chain.score >= this.ScoreSignificant){
			chain = chainstarts.pop();
			// So this should not be checked here. Because this spans multiple tiles, it is possible that a low scoring chain will score better in a future tile.
			//if(! index.has(chain.i)){
			//	// This would indicate that the item we retrieved from the sorted
			//	// array was removed from the master index. That means it was
			//	// part of a prior chain. In this case, we should just ignore
			//	// it.... it is not the start of a chain.
			//	continue;
			//}
			if(!chain.score){
				index.delete(chain.i);
				console.warn('This should never happen');
				continue;
			}
			this.remaining = index.size;
			this.postMessage({type:'progress', data:this.toJSON()});

			// construct teh chain's history
			chain.history = [];
			for(let item = chain; item; item = index.get(item.prev)){
				chain.history.push(item);
				index.delete(item.i);

				item.x = Math.floor(item.i/4)%this.gpu.width;
				item.y = Math.floor(Math.floor(item.i/4)/this.gpu.width);

				// map the next node in the chain. This is done by
				// 1. finding the directional component
				let md = modDir[item.dir];
				// 2. take the current position
				item.prev = item.i;
				// 3. find the directional offset along the X
				item.prev -= md[0] * 1 * 4;
				// 4. find the directional offset along the Y
				item.prev -= md[1] * this.gpu.width * 4;
			}

			let finItem = chain.history[chain.history.length-1];
			chain.score -= Math.max(0,finItem.score-this.ScoreMatch);
			if(chain.score >= this.ScoreSignificant){
				resolved.push(chain);
			}
		}
		this.postMessage({type:'progress', data:this.toJSON()});
		index.clear();
		// A second sorting is not required, because we always start from the most valueab
		//resolved = resolved
		//	.sort((a,b)=>{
		//		let ord = b.score - a.score;
		//		if(ord === 0){
		//			ord = a.i - b.i;
		//		}
		//		return ord;
		//	})
		//	;
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

		const dir = ['?','&#129121;','&#129120;','&#129124;'];

		let values = this.gpu.read();
		let v = 0;

		let table = [];
		let row = ['&nbsp;'];
		for(let c=0; c<this.submissions[HORIZ].length; c++){
			row.push(this.submissions[HORIZ][c].lexeme + '<sub>['+c+']</sub>');
		}
		table.push(row.map((d,i)=>{return '<th>'+d+'</th>';}).join(''));

		for(let r=0; r<this.submissions[VERT].length && v<values.length; r++){
			let row = [this.submissions[VERT][r].lexeme+'<sub>['+r+']</sub>'];
			for(let c=0; c<this.submissions[HORIZ].length && v<values.length; c++){
				let cell = Array.from(values.slice(v,v+4));
				cell = cell.map(v=>{return +v;});
				cell.push(cell[2]+cell[3]*256);
				cell.splice(2,0,Math.floor(cell[1]%4));
				cell[1] = Math.floor(cell[1]/4);
				cell[0] -= 127;
				cell = cell.map(v=>{return v.toString()});
				cell = [
					`<i>${cell[0]}</i>`,
					`<i>${cell[1]} , ${cell[2]}</i>`,
					`<i>${cell[3]}</i> + <i>${cell[4]}</i> = ${cell[5]}`,
					`<sub>${dir[cell[2]]}[${[r,c].join(',')}]</sub>`,
				].join('\n');
				v += 4;
				row.push(cell);
			}
			table.push(row.map((d)=>{return '<td>'+d+'</td>';}).join(''));
		}
		table = table.join('</tr><tr>');

		this._html = "<table><caption></caption><tbody><tr>"+table+"</tr></tbody></table>";
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
		score = (w.rg == n.ba) ? scores.x : scores.y;
		gl_FragColor = vec4(score,0,0,0);
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
	/**
	 * The scores object contains 4 values:
	 * x: match
	 * y: mismatch
	 * z: skip
	 * w: terminus
	 */
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

		// Find the max score from the chain
		float nwScore = (nw.b*bitEnc.x) + (nw.a*bitEnc.y);
		float wScore  = ( w.b*bitEnc.x) + ( w.a*bitEnc.y);
		float nScore  = ( n.b*bitEnc.x) + ( n.a*bitEnc.y);
		vec4 score = vec4(0.0, nScore, wScore, nwScore);
		// and the terminus
		vec4 term  = vec4(0.0, n.g, w.g, nw.g);
		term = floor((term * bitEnc.x) / 4.0);

		// pick the biggest of the highest score
		score.x = max(score.x, score[1]);
		score.x = max(score.x, score[2]);
		score.x = max(score.x, score[3]);
		term.x = score.x;

		// Figure out what the directionality of the score was, and get the 
		// terminus that was associated with that
		if(int(score.x) == int(score[3])){
			dir = 3;
			term.yz *= 0.0;
		}
		else if(int(score.x) == int(score[2])){
			dir = 2;
			term.yw *= 0.0;
		}
		else{
			dir = 1;
			term.zw *= 0.0;
		}

		// apply the skip penalty for non-diagonal
		if(dir != 3){
			score.x += scoresExpanded.z;
		}
		// add up our new score
		score.x += (here.r*bitEnc.x)-127.0;
		// clamp it to Zero
		score.x = max(score.x , 0.0);
		score.x = min(score.x , bitEnc.y);

		/*
		 * calcuate ther termination value
		 * 
		 * The terminus is like a fuze. When it burns out 
		 * the chain is assumed complete. We refuel the fuze
		 * periodically
		 * 
		 */
		// This is the difference between the new score (score.x) and 
		// the old score in the chain (term.x).
		term.x -= score.x * -1.0;
		// If the local score was positive (a match), we reset the fuse
		term.x = term.x + (scoresExpanded.w * ceil(here.r/256.0));
		// This difference is then added to the running total (term@dir) 
		// of the terminus and clamped.
		term.x = term.x + term.y + term.z + term.w;
		term.x = max(0.0, term.x);
		term.x = min(scoresExpanded.w, term.x);
		// if the fuze has run out, we need to terminate the chain and 
		// scoring by zeroing out the score
		if(term.x <= 0.0){
			score.x = 0.0;
		}

		// place the result in the last two registers
		here.a = floor(score.x / 256.0);
		here.b = score.x - (here.a*256.0);

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
		let a = params.data.submissions[VERT];
		let b = params.data.submissions[HORIZ];
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
