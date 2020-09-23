export{
	checkNotNull,
	checkArgument,
	hasher,
	hashCode
};

/*
global DOMTokenList
global File
global jsSHA
*/

function checkNotNull(value = null){
	if(value === null || typeof value === 'undefined'){
		console.trace("Null Exception (checkNotNull)");
		throw new Error("Null Exception (checkNotNull)");
	}
}

function checkArgument(value = null, msg = ""){
	checkNotNull(value);
	checkNotNull(msg);

	assert(value,msg);
}

function assert(check, msg = "no message"){
	check = check !== false;
	if(!check){
		throw new Error('Assertion failure: ' + msg);
	}
}

function hasher(value){
	let hasher = new jsSHA("SHA-512", "TEXT");
	hasher.update(value);
	let hashed = hasher.getHash('B64');
	return hashed;
}


/**
 * Implementation of Java String hashcode
 *
 * Based on reading at stack... there are some improvements to my original implementation
 * https://stackoverflow.com/questions/7616461/generate-a-hash-from-string-in-javascript-jquery
 */
function hashCode(str){
	const shiftSize = 5;
	const hashSize = 53;
	const wrapSize = hashSize - shiftSize;
	let hash = 0;
	for(let i=0; i<str.length; i++){
		let c = str.charCodeAt(i);
		//console.debug("Hash: "+ hash.toString(2) + '-' + c.toString(2));
		let wrap =  hash >>> wrapSize;
		//console.debug(" - Wrap: " + wrap.toString(2));
		hash = hash << shiftSize;
		//console.debug(" - 1: " + hash.toString(2));
		hash = hash ^ c;
		//console.debug(" - 2: " + hash.toString(2) + ' ^ ' + c.toString(2));
		hash = hash | wrap;
		//console.debug(" - 3: " + hash.toString(2));
	}
	//console.debug("Done: "+ hash.toString(2));
	return hash;
}
export function docsEqual (aDoc,bDoc){
	if(typeof aDoc === 'string'){
		aDoc = JSON.parse(aDoc);
	}
	aDoc = JSON.clone(aDoc);

	delete aDoc._id; delete aDoc._rev;
	delete bDoc._id; delete bDoc._rev;

	aDoc = JSON.stringify(aDoc);
	bDoc = JSON.stringify(bDoc);

	let areSame = (aDoc === bDoc);
	return areSame;
}


export function defer(func){
	return setTimeout(func);
}


/**
 * Given a seed number, will generate a consistently uniform distribution of numbers
 *
 * https://stackoverflow.com/questions/521295/seeding-the-random-number-generator-in-javascript
 */
export function UniformDistribution(seed) {
	function lcg(a) {return a * 48271 % 2147483647;}
	seed = Math.abs(seed);
	seed = seed ? lcg(seed) : lcg(Math.random());
	return function() {return (seed = lcg(seed)) / 2147483648;};
}

/**
 *
 *
 */
export function CommonLead(strings,splitter=''){
	if(!strings.length){
		return '';
	}

	strings = JSON.clone(strings);
	strings = strings.map(d=>{return d.split(splitter);});
	let maxlen = strings.reduce((a,d)=>{return Math.min(a,d.length);},Number.MAX_VALUE);
	strings = strings.map((d)=>{
		d = d.slice(0,maxlen);
		return d;
	});


	let isSame = false;
	let common = "dummy value";
	while(!isSame && common.length > 0){
		common = strings[0].join(splitter);
		isSame = true;
		for(let s=0; s<strings.length; s++){
			let str = strings[s].join(splitter);
			if(common !== str){
				isSame = false;
			}
			strings[s].pop();
		}
	}
	common = [common,splitter].join('');
	return common;
}



String.prototype.hashCode = function(){
	return hashCode(this);
};

JSON.clone = function(obj){
	let json = null;
	try{
		json = JSON.stringify(obj);
		json = JSON.parse(json);
	}
	catch(e){
		throw new Error(e.message);
	}
	return json;
};

JSON.merge = function(a){
	if(arguments.length > 1){
		a = Array.from(arguments);
	}
	if(!Array.isArray(a)){
		a = [a];
	}
	let obj = a.reduce(function(a,d){
		Object.entries(d).forEach(function(pair){
			pair = JSON.clone(pair);
			a[pair[0]] = pair[1];
		});
		return a;
	},{});
	return obj;
};


if(!('PHI' in Math)){
	Math.PHI = (1 + (5 ** 0.5)) / 2;
}

if(typeof DOMTokenList !== 'undefined'){
	if(!('push' in DOMTokenList.prototype)){
		DOMTokenList.prototype.push = function(className){
			if(Array.from(this).pop() === className){
				return className;
			}
			this.remove(className);
			this.add(className);
			return className;
		};
	}
}
