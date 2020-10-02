import * as utils from '../DeepDiff/util/misc.js';

export default class psForceDirected extends HTMLElement {
	constructor(){
		super();

		this._ = {
			results: {},
			opts: {
				lineColour: 'darkgray',
				nodeColour: ['steelblue'],
				radius: 5,
				height: 300,
				width:  300,
				interval : 60,
				stopVelocity: 0.1,
			},
			animation: {
				speed : 60,
				lastFrame : 0,
				timer : null
			},
			physics: {
				DELTAT: 0.01,
				SEGLEN: 15,
				SPRINGK: 10,
				MASS: 1,
				GRAVITY: 50,
				INERTIA: 10,
				STOPVEL: 0.1,
				BOUNCE: 0.75
			},
			handler:(e)=>{
				this.monitorResults();
			}
		};
		this._.physics.SEGLEN = this._.radius*3;


		this.links = {};
		this.nodes = {};
		this.centerNode = {};

		let shadow = this.attachShadow({mode: 'open'});
		shadow.innerHTML = [
			"<style>",
			" svg {",
			"  padding:0;",
			"  height:300px;",
			"  width:300px;",
			"  list-style-type:none;",
			"  position:relative;",
			"  border:1px solid darkgray;",
			"  margin:1em;",
			" }",
			"</style>",
			"<svg height='300' width='300'><g class='link'></g><g class='node'></g></svg>"
		].join('\n');
		this.svg = shadow.querySelector('svg');
		this.svg.lines = this.svg.children[0];
		this.svg.nodes = this.svg.children[1];

		this._.shadow = shadow;

		this.stop();
	}

	get DeepDiff(){
		return this._.results;
	}
	set DeepDiff(value){
		if(this._.results !== value){
			if(this._.results.removeEventListener){
				this._.results.removeEventListener('results',this._.handler);
				this._.results.removeEventListener('load',this._.handler);
			}
			this._.results = value;
			this._.results.addEventListener('results',this._.handler);
			this._.results.addEventListener('load',this._.handler);
			this.monitorResults();
		}
	}

	get results(){
		return this.DeepDiff;
	}
	set results(value){
		this.DeepDiff = value;
	}

	get innerHTML(){
		let shadow = this._.shadow;
		let html = shadow.innerHTML;
		return html;
	}


	monitorResults(newval,oldval){
		this.start();
		this.ReSync();
	}


	RenderFrame(){
		Object.values(this.links).forEach((link)=>{
			let el = link.element;
			el.setAttribute('stroke',link.complete===1?this._.opts.lineColour:"orange");
			el.setAttribute('stroke-width',Math.floor((this._.opts.radius+1)*link.value));
			el.setAttribute('opacity',link.value);
			el.setAttribute('x1',link.points[0].pos.x);
			el.setAttribute('y1',link.points[0].pos.y);
			el.setAttribute('x2',link.points[1].pos.x);
			el.setAttribute('y2',link.points[1].pos.y);
		});
		Object.values(this.nodes).forEach(node=>{
			let el = node.element;
			el.setAttribute('cx',node.pos.x);
			el.setAttribute('cy',node.pos.y);
			el.setAttribute('r',this._.opts.radius);
			el.setAttribute('fill',this._.opts.nodeColour[node.group]);
		});
	}

	UpdateFrame(){
		const now = Date.now();

		/*
		const RubberBandForce = function(dotA, dotB, strength, seglen){
			let dx = (dotB.x - dotA.x);
			let dy = (dotB.y - dotA.y);
			let len = Math.sqrt(dx*dx + dy*dy);
			let spring = {x:0,y:0};
			if (len > seglen) {
				len = len - seglen;
				let force = SPRINGK * len * strength;
				let ratioBase = Math.abs(dx) + Math.abs(dy);
				spring.x = (dx / ratioBase) * force;
				spring.y = (dy / ratioBase) * force;
			}
			return spring;
		};
		const gravityForce = function(dotA, dotB, strength, seglen){
			let dx = (dotB.x - dotA.x);
			let dy = (dotB.y - dotA.y);
			//let len = Math.sqrt(dx*dx + dy*dy);
			let ratioBase = Math.abs(dx) + Math.abs(dy);
			let gravity = {x:GRAVITY,y:GRAVITY};
			if(ratioBase === 0){
				ratioBase = 0.001;
			}
			let force = GRAVITY * strength;
			gravity.x = (1 - dx / ratioBase) * force;
			gravity.y = (1 - dy / ratioBase) * force;
			return gravity;
		};
		*/
		const SpringForce = (dotA, dotB, strength, seglen)=>{
			let dx = (dotB.x - dotA.x);
			let dy = (dotB.y - dotA.y);
			let len = Math.sqrt(dx*dx + dy*dy);
			let spring = {x:0,y:0};

			len = len - seglen;
			let force = this._.physics.SPRINGK * len * strength;
			let ratioBase = Math.abs(dx) + Math.abs(dy);
			if(ratioBase === 0){
				dx = 1;
				dy = 1;
				ratioBase = 2;
			}
			spring.x = (dx / ratioBase) * force + 0.000001;
			spring.y = (dy / ratioBase) * force + 0.000001;

			return spring;
		};

		Object.values(this.links).forEach(link=>{
			// TODO: this is hacky... it should be picked up naturally on change
			let r = this.results.report.results[link.key];
			if(!r){
				return;
			}
			link.complete = r.totalTokens === 0 ? 1 : r.complete / r.totalTokens;
			link.value = r.percentMatched;

			// Calculate the forces
			let spring = SpringForce(
				link.points[0].pos,
				link.points[1].pos,
				0.1 + 0.9*link.value,
				// This is the natural distance we want between the two 
				// objects. (the length of the spring)
				// 
				// We determine this to be 100 pixels * the level of similarity + but the radius of the objects
				//
				// this should space them out more as they are less similar, to 
				// a maximum of 100 pixels, and a minimum of the radius (collision 
				// resistance)
				100*(1-link.value)+this._.opts.radius*10
			);
			//let gravity = SpringForce(
			//	link.points[0].pos,
			//	link.points[1].pos,
			//	-0.01,
			//	500
			//);
			//spring.x += gravity.x;
			//spring.y += gravity.y;

			spring.x /= 2;
			spring.y /= 2;

			let direction = 1;
			link.points.forEach((point)=>{
				point.force.x += spring.x * direction;
				point.force.y += spring.y * direction;
				direction = -1;
			});
		});

		let shouldStop = true;
		Object.values(this.nodes).forEach(node=>{
			// Now we can start applying physics
			let resist = {
				x : -1 * this._.physics.INERTIA * node.velocity.x,
				y : -1 * this._.physics.INERTIA * node.velocity.y,
			};

			let accel = {
				x : node.force.x + resist.x,
				y : node.force.y + resist.y,
			};
			accel.x *= this._.physics.DELTAT;
			accel.y *= this._.physics.DELTAT;
			// apply the acceleration to the velocity
			node.velocity.x += accel.x;
			node.velocity.y += accel.y;
			// This force has been accumulated, and consumed: set it to zero
			node.force.x = 0;
			node.force.y = 0;

			// move the node
			node.pos.x += node.velocity.x;
			node.pos.y += node.velocity.y;

			// apply boundary checking
			if(node.pos.x < 0){
				let boundary = 0;
				let overflow = (boundary - node.pos.x);
				node.pos.x = boundary + overflow * this._.physics.BOUNCE;
				node.velocity.x = -1 * node.velocity.x * this._.physics.BOUNCE;
			}
			else if(node.pos.x > this._.opts.width){
				let boundary = this._.opts.width;
				let overflow = (boundary - node.pos.x);
				node.pos.x = boundary + overflow * this._.physics.BOUNCE;
				node.velocity.x = -1 * node.velocity.x * this._.physics.BOUNCE;
			}
			if(node.pos.y < 0){
				let boundary = 0;
				let overflow = (boundary - node.pos.y);
				node.pos.y = boundary + overflow * this._.physics.BOUNCE;
				node.velocity.y = -1 * node.velocity.y * this._.physics.BOUNCE;
			}
			else if(node.pos.y > this._.opts.height){
				let boundary = this._.opts.height;
				let overflow = (boundary - node.pos.y);
				node.pos.y = boundary + overflow * this._.physics.BOUNCE;
				node.velocity.y = -1 * node.velocity.y * this._.physics.BOUNCE;
			}

			// check the item has settled down
			// at some point there is so little movement we may as well call it
			// check our stop constants to see if the movement is too small to
			// really consider
			let isStopped =
				Math.abs(node.velocity.x) < this._.physics.STOPVEL &&
				Math.abs(node.velocity.y) < this._.physics.STOPVEL
				;
			if (isStopped) {
				node.velocity.x = 0;
				node.velocity.y = 0;
			}
			else{
				// if this node is still moving, we will need to calculate
				// another frame
				shouldStop = false;
			}
		});

		if(shouldStop){
			this.stop();
		}

		this._.animation.lastFrame = now;
		this.RenderFrame();
	}

	start(){
		if(this._.animation.timer){
			return this._.animation.timer;
		}
		this._.animation.lastFrame = Date.now();
		this._.animation.timer = setInterval(()=>{
			this.UpdateFrame();
		},this._.animation.speed);
		return this._.animation.timer;
	}

	stop(){
		clearInterval(this._.animation.timer);
		this._.animation.timer = null;
	}

	/**
	 * Syncronizes the objects we are movign around the screen with their
	 * underlying objects.
	 */
	get ReSync(){
		if(this._ReSync) return this._ReSync;

		let syncer = function(){
			let results = Object.assign({},this.results.report.results);
			results = Object.entries(results);
			Object.keys(this.links).forEach(name=>{
				if(!this.results.report.results[name]){
					let link = this.links[name];
					link.element.parentElement.removeChild(link.element);
					delete this.links[name];
				}
			});
			results.forEach(result =>{
				let key = result[0];
				let val = result[1];
				let link = this.links[key];
				if(link){
					return link;
				}
				link = {
					points: [],
					value : 0,
					key : key,
					element: null
				};
				this.links[key] = link;
				link.points = val.submissions.map(d=>{
					let node = this.nodes[d.name];
					if(node){
						return node;
					}
					node = {
						key: d.name,
						pos: {x:0,y:0},
						velocity: {x:0,y:0},
						force: {x:0,y:0},
						links: {},
						group: 0,
						complete: 0
					};
					this.nodes[d.name] = node;

					// start from a deterministic position along the outside
					let initPos = d.name;
					initPos = initPos.hashCode();
					initPos = utils.UniformDistribution(initPos);
					initPos = initPos();
					initPos = Math.round(initPos * this.svg.clientWidth);
					initPos = {
						y: initPos,
						x: (initPos%2) ? -1 : this.svg.clientWidth+1,
					};

					// start in the center
					initPos = {
						x:145 + Math.round(10*Math.random()),
						y:145 + Math.round(10*Math.random()),
					};
					node.pos = initPos;

					node.element = document.createElementNS("http://www.w3.org/2000/svg",'circle');
					node.element.setAttribute('r',this._.opts.radius);
					node.element.innerHTML = "<text>"+node.key+"</text>";
					node.element.addEventListener('mousedown',(e)=>{
						let node = e.target.firstChild.innerHTML;
						node = this.nodes[node];
						let svg = e.target.parentNode.parentNode;
						let restart = ()=>{
							this.start();
						};
						function mousemove(m){
							node.velocity.x = 0;
							node.velocity.y = 0;
							node.pos.x = m.layerX;
							node.pos.y = m.layerY;
							restart();
						}
						function remover(m){
							svg.removeEventListener('mousemove',mousemove);
							window.removeEventListener('mouseup',remover);
						}
						svg.addEventListener('mousemove',mousemove);
						window.addEventListener('mouseup',remover);
					});

					this.svg.nodes.append(node.element);

					return node;
				});

				link.points.forEach(node=>{
					node.links[link.key] = link;
				});

				link.element = document.createElementNS("http://www.w3.org/2000/svg",'line');
				link.element.setAttribute('opacity',"1");
				link.element.setAttribute('stroke','black');
				link.element.setAttribute('stroke-width','3');
				this.svg.lines.append(link.element);

			});
			// search the nodes for items that there is no longer a link for
			Object.keys(this.nodes).forEach(node=>{
				let found = Object.values(this.links).some((link)=>{
					return link.points[0].key === node || link.points[1].key === node;
				});
				if(!found){
					let n = this.nodes[node];
					n.element.parentElement.removeChild(n.element);
					delete this.nodes[node];
				}
			});
			this.start();
		};

		this._ReSync = _.throttle(syncer,1000);
		return this._ReSync;
	}


}


window.customElements.define('ps-forcedirected',psForceDirected);
try{
	/* global Vue */
	if(Vue && !Vue.config.ignoredElements.includes('ps-forcedirected')){
		Vue.config.ignoredElements.push('ps-forcedirected');
	}
}
catch(err){}
