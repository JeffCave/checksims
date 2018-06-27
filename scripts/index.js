'use strict';

/*
global Vue
*/

import "https://cdnjs.cloudflare.com/ajax/libs/underscore.js/1.9.0/underscore-min.js";

//import 'https://unpkg.com/vue/dist/vue.js';
import 'https://unpkg.com/vuetify/dist/vuetify.js';
import 'https://unpkg.com/vue-material';
//import 'https://unpkg.com/http-vue-loader';


import {DeepDiff} from './DeepDiff/DeepDiff.js';
import {SimilarityMatrix} from './DeepDiff/visualizations/similaritymatrix/SimilarityMatrix.js';
import {MatrixPrinterRegistry} from './DeepDiff/visualizations/similaritymatrix/output/MatrixPrinterRegistry.js';
import {Submission} from './DeepDiff/submission/Submission.js';


import './DeepDiff/visualizations/similaritymatrix/output/MatrixToCSVPrinter.js';
import './DeepDiff/visualizations/similaritymatrix/output/MatrixToHTMLPrinter.js';

import {d3ForceDirected} from './widgets/force.js';
import * as Panels from './widgets/panel.js';
import './widgets/treeview.js';
import './widgets/submissions.js';
import './widgets/filedrop.js';
import './widgets/ResultsTable.js';


/**
 * Parses DeepDiff' command-line options.
 *
 * TODO: Consider changing from a  class? Having as an instance variable would greatly simplify
 */
class indexPage {
	constructor() {
		this.runner = new DeepDiff();
		this.files = [];
		let self = this;


		this.displaySubmissions = new Vue({
			el:'#submissions',
			data: {
				db: this.runner.db,
				filter: 'checksims/submissions',
			},
//			components: {
//				'my-component': 'my-component.vue'
//			},
		});
		this.displayFiles = new Vue({
			el: '#files',
			data: {
				treeData: this.files,
				onfile: function(e){
					Array.from(e.target.files).forEach(function(file){
						if (file.type === 'application/x-zip-compressed' || file.type === 'application/zip'){
							self.attachSubmissions(file)
								.then(function(files){
									console.log('Submissions attached');
								})
								;
						}
					});
				}
			}
		});
		this.displayResults = new Vue({
			el:'#results',
			data: {
				report:this.runner.report
			},
		});
		Panels.initialize();

		let adder = document.querySelector('#submissionMaker');
		adder.addEventListener('dragover',function(event){
			event.preventDefault();
			event.target.style.backgroundColor="green";
		});
		adder.addEventListener('dragleave',function(event){
			event.target.style.backgroundColor="transparent";
		});
		adder.addEventListener('drop',function(event){
			event.target.style.backgroundColor="blue";
			let path = event.dataTransfer.getData("text/plain");
			path = new RegExp("^" + path);
			let files = self.files
				.filter(function(d){
					let isMatch = path.test(d.name);
					return isMatch;
				})
				.reduce(function(a,d){
					let p = d.name.replace(path,'');
					a[p] = d.content;
					return a;
				},{})
				;
			path = event.dataTransfer.getData("text/plain");
			path = path.split('/').pop();
			let submission = new Submission(path,files);
			self.runner.addSubmissions(submission);
		});

		this.runner.addEventListener('results',()=>{
			this.renderResults();
		});
	}

	get Containers(){
		if(!('_containers' in this)){
			this._containers = Array.from(document.querySelectorAll('#results > details'))
				.reduce(function(a,d){
					if(d.dataset.type){
						a[d.dataset.type] = d;
					}
					return a;
				},{})
				;
		}
		return this._containers;
	}

	async attachSubmissions(blob){
		let parent = this;
		this.submissions = null;
		// 1) read the Blob
		let files = await JSZip.loadAsync(blob);
		files = await Submission.fileListFromZip(files);
		Object.entries(files).forEach(function(file){
			parent.files.push({
				name:file[0],
				content:file[1],
			});
		});
		return files;
	}

	attachArchive(blob){
		let parent = this;
		this.archive = null;
		// 1) read the Blob
		return JSZip
			.loadAsync(blob)
			.then(function(zip) {
				parent.archive = zip;
			})
			.catch(function (e) {
				console.error("Error reading " + blob.name + ": " + e.message);
			})
			;
	}

	attachCommon(blob){
		let parent = this;
		this.common = null;
		// 1) read the Blob
		return JSZip
			.loadAsync(blob)
			.then(function(zip) {
				parent.common = zip;
			})
			.catch(function (e) {
				console.error("Error reading " + blob.name + ": " + e.message);
			})
			;
	}



	async renderMatrixes(results,htmlContainers){
		let deduplicatedStrategies = Array.from(new Set(['html','csv']));
		if(deduplicatedStrategies.length === 0) {
			throw new Error("Error: did not obtain a valid output strategy!");
		}

		let resultsMatrix = await SimilarityMatrix.generateMatrix(results);

		// Output using all output printers
		for(let i = 0; i < deduplicatedStrategies.length; i++){
			let name = deduplicatedStrategies[i];
			if(name in htmlContainers){
				console.log("Generating " + name + " output");
				let output = MatrixPrinterRegistry.processors[name];
				output = await output(resultsMatrix);
				htmlContainers[name].querySelector('.result').innerHTML = output;
			}
		}
	}

	renderListForce(results,htmlContainers){
		//let container = htmlContainers.force.querySelector('ul.result');
		//let dimensions = window.getComputedStyle(container);
		d3ForceDirected(results);
	}

	renderResults(){
		if(this.renderResultsThrottle){
			return;
		}
		this.renderResultsThrottle = setTimeout(async ()=>{
			this.renderResultsThrottle = null;
			let report = {
				"results" : await this.runner.Results,
				"submissions": [],
				"archives":this.runner.archiveSubmissions
			};
			if(report.results){
				//report.submissions = await this.runner.Submissions;
				report.submissions = report.results.reduce((a,d)=>{
					d.submissions.forEach((s)=>{
						s.name = s.name || s.submission;
						a[s.name] = s;
					});
					return a;
				},{});
				report.submissions = Object.values(report.submissions);

				// go lookup all of the items in the hide list
				let hides = report.submissions
					.filter((d)=>{
						return d.visible === false;
					})
					.map((d)=>{
						return d.name;
					})
					;
				// filter out any results that are in the hide list
				report.results = report.results.filter((d)=>{
					let match = hides.some(s=>{
						let match = d.submissions[0].name === s || d.submissions[1].name === s;
						return match;
					});
					return !match;
				});
			}

			let htmlContainers = this.Containers;

			this.renderMatrixes(report,htmlContainers);
			this.renderListForce(report,htmlContainers);
		},300);
	}


	/**
	 * Parse CLI arguments and run DeepDiff from them.
	 *
	 * TODO add unit tests
	 *
	 * @param args CLI arguments to parse
	 */
	async runHtml(htmlContainers = null){
		if(!htmlContainers){
			htmlContainers = this.Containers;
		}
		let checkSims = this.runner;

		checkSims.CommonCode = this.common;
		checkSims.ArchiveSubmissions = this.archive;
		let results = await checkSims.runDeepDiff();

		this.renderResults(results,htmlContainers);
	}

}



window.addEventListener('load',async function(){
	Vue.use(VueMaterial.default);
	Vue.use(httpVueLoader);


	let checker = new indexPage();
	checker.renderResults();
});

