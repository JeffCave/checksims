'use strict';

/*
global _
global HTMLElement
*/

export default class psSimilarityMap extends HTMLElement {
	constructor(deepdiff){
		super();
		this._ = {result:null,deepdiff:deepdiff};
		this.attachShadow({mode: 'open'});
	}

	get isShow(){
		return !(this.submission.visible === false);
	}

	get showhideIcon(){
		if(this.isShow){
			return icons.visibility;
		}
		return icons.visibility_off;
	}

	get flip(){
		return this._.flip == true;
	}
	set flip(value){
		value = value == true;
		this._.flip = value;
	}
	get result(){
		return this._.result;
	}
	set result(value){
		value = value || null;
		if(!value) return;
		if(this._.result && value && this._.result.name === value.name) return;
		// TODO: temporary solution to problem [#33]
		if(!value.chains){
			this.DeepDiff.Refresh(value.name ,true);
			return;
		}


		let elems = Array.from(this.shadowRoot.querySelectorAll('article'));
		elems.forEach(e=>{ e.innerHTML = ''; });
		this._.result = value;
		this.Render();
	}

	get DeepDiff(){
		return this._.deepdiff;
	}

	showhide(event){
		// only explicit false is 'false' ... everything else is to be
		// assumed 'true'. Also, toggle it.
		let value = (this.submission.visible === false);
		// set it on the object
		this.submission.visible = value;
		return value;
	}

	async Render(){
		let panel = this.shadowRoot;
		panel.innerHTML =
			'<style>'+
			this.InitialCss+
			'</style>'+
			this.Template
			;
		if(!this.result) return;

		let subNames = this.result.submissions.map(sub=>{return sub.name;});
		let elems = Array.from(this.shadowRoot.querySelectorAll('article'));
		let submissions = await this.DeepDiff.Submissions;
		submissions = submissions
			.filter((sub)=>{
				return subNames.includes(sub.name);
			})
			;
		if(this.flip){
			submissions.reverse();
		}
		for(let side of Array(2).keys()){
			let chains = this.result.chains.slice(0,this.PalletteSize-1)
				.sort((a,b)=>{
					let sort = a.score-b.score;
					if(sort === 0){
						sort = a.id - b.id;
					}
					return sort;
				})
				.map((chain,c)=>{
					let s = side;
					if(this.flip){
						s = 1 - s;
					}
					chain = chain.submissions[s];
					let sub = submissions[s];
					let rtn = {
						start: sub.tokens[chain.first].range[0],
						end: sub.tokens[chain.last].range[1],
						path: sub.tokens[chain.first].range[2],
						i:c+1
					};
					return rtn;
				})
				.reduce((a,d)=>{
					a[d.path] = a[d.path] || [];
					a[d.path].push(d);
					return a;
				},{})
				;
			let submission = submissions[side];
			let element = elems[side];
			for(let section in submission.content){
				let content = submission.content[section];
				let header = document.createElement('details');
				let body = document.createElement('pre');
				header.innerHTML = [
					`<summary>${content.name}</summary>`,
					'<ul>',
					//` <li>${content.name}</li>`,
					` <li>${content.relativePath}</li>`,
					` <li>${content.type}</li>`,
					'</ul>',
				].join('\n');

				let segments = chains[section] || [];
				let range = {
					start: content.blob.length-1,
					path: section
				};
				for(let seg = segments.pop() ; seg; seg = segments.pop()){
					seg.end++;
					let span = document.createTextNode('');
					range.end = range.start;
					range.start = seg.end;
					span.textContent = submission.fetchSegment(range);
					body.prepend(span);
					span = document.createElement('span');
					span.textContent = submission.fetchSegment(seg);
					span.dataset.chain = seg.i;
					body.prepend(span);
					range = seg;
				}
				let span = document.createTextNode('');
				range.end = range.start;
				range.start = 0;
				span.textContent = submission.fetchSegment(range);

				body.dataset.file = section;
				element.append(header);
				element.append(body);
			}

		}

		let pallette = this.shadowRoot.querySelector('ul');
		pallette.innerHTML = '';
		let chainsize = Math.min(this.result.chains.length, this.PalletteSize-1);
		for(let i=0; i<chainsize; i++){
			let li = document.createElement('li');
			li.dataset.chain = i+1;
			let pct = this.result.chains[i].submissions.map((d,i)=>{
				let pct = d.tokens;
				pct /= this.result.submissions[i].totalTokens;
				pct *= 100;
				pct = Math.ceil(pct).toFixed();
				pct = `<output name='side${i}'>${pct}</output>`;
				return pct;
			});
			if(this.flip){
				pct = pct.reverse();
			}
			li.innerHTML = '&nbsp;' + pct.join(' | ') + '&nbsp;';
			pallette.append(li);
			// we need to add a click handler to the output. The idea is
			// to scroll down to the corresponding highlighted element
			li.addEventListener('dblclick',()=>{
				Array.from(li.querySelectorAll('output')).forEach((output,i)=>{
					output.dispatchEvent(new Event('click'));
				});

			});
			Array.from(li.querySelectorAll('output')).forEach((output,i)=>{
				i++;
				output.addEventListener('click',()=>{
					let block = this.shadowRoot.querySelector(`article:nth-of-type(${i}) > pre > span[data-chain='${li.dataset.chain}']`);
					block.scrollIntoView({behaviour:'smooth',block:'start'});
				});
			});
		}
	}

	get innerHTML(){
		return this.html;
	}

	async html(){
		await this.Render();
		let html = this.shadowRoot.innerHTML;
		return html;
	}

	get title(){
		let title = this.result.submissions.map((d)=>{
			return d.name;
		});
		if(this.flip){
			title.reverse();
		}
		title = title.join(' &#8227; ');
		return title;
	}

	get Template(){
		return psSimilarityMap.Template;
	}
	static get Template(){
		return`
  <ul></ul>
  <article></article><article></article>
		`;
	}

	get PalletteSize(){
		return psSimilarityMap.PalletteSize;
	}

	static get PalletteSize(){
		return 9;
	}

	get InitialCss(){
		return psSimilarityMap.InitialCss;
	}

	static get InitialCss(){
		let pallette = new Array(this.PalletteSize)
			.fill(0)
			.map((d,i)=>{
				return `*[data-chain='${i}']{background-color:var(--data-pallette-${i});}`
			})
			.join('\n');
		return`
article {
	position:relative;
	display:inline-block;
	width:49%;
	height:80vh;
	margin:0;
	border:1px solid darkgray;
	overflow:auto;
	vertical-align: top;
}
article:last-of-type{
	border-left:0;
}
article > pre {
	display:block;
	font-size:0.8em;
	padding:1em;
}
article > pre > span[data-chunk]{
	background-color:var(--data-pallette-0);
}
${pallette}
details{
	border-bottom:1px solid darkgray;
	text-align:right;
}
details > ul{
	list-style:none;
	font-size:smaller;
}
:host > ul {
	color:rgba(255,255,255,0);
	font-size:0.75em;
	margin-top:0;
	padding-top:0;
	list-style:none;
	padding:0;
	margin:auto;
	margin-top:0.5em;
	margin-bottom:0.5em;
	text-align:center;
}
:host > ul > li{
	border:0.1em solid darkgray;
	display:inline-block;
	position:relative;
	margin-right:0.3em;
	padding: 0.1em;
	border-radius:1em;
	text-align:center;
	color: white;
	cursor:pointer;
}
:host > ul > li:hover{
	box-shadow: 0px 0px 10px #888888;
}
:host > ul > li > output::after{
	content:'%';
}
		`;
	}
}

window.customElements.define('ps-similaritymap',psSimilarityMap);

try{
	/* global Vue */
	if(Vue){
		if(!Vue.config.ignoredElements.includes('ps-similaritymap')){
			Vue.config.ignoredElements.push('ps-similaritymap');
		}
	}
}
catch(err){}
