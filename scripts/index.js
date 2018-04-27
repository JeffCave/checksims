'use strict';

import {ChecksimsException} from './Checksims/ChecksimsException.js';
import {ChecksimsRunner} from './Checksims/ChecksimsRunner.js';
import {SimilarityMatrix} from './Checksims/visualizations/similaritymatrix/SimilarityMatrix.js';
import {MatrixPrinterRegistry} from './Checksims/visualizations/similaritymatrix/output/MatrixPrinterRegistry.js';
import {Submission} from './Checksims/submission/Submission.js';

import './Checksims/visualizations/similaritymatrix/output/MatrixToCSVPrinter.js';
import './Checksims/visualizations/similaritymatrix/output/MatrixToHTMLPrinter.js';

import {d3ForceDirected} from './widgets/force.js';
import * as Files from '/scripts/widgets/filesystem.js';

/**
 * Parses Checksims' command-line options.
 *
 * TODO: Consider changing from a  class? Having as an instance variable would greatly simplify
 */
class indexPage {
	constructor() {
		this.runner = new ChecksimsRunner();
		this.files = {};

		Files.DisplaySubmissions('script[name="subtest"]',this.runner.Submissions);
		let elem = document.querySelector('#filetest');
		Files.DisplayFiles(elem,this);

		let self = this;
		let adder = document.querySelector('#submissions > span');
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
			let files = Object.entries(self.files)
				.filter(function(d){
					let isMatch = path.test(d[0]);
					return isMatch;
				})
				.reduce(function(a,d){
					let p = d[0].replace(path,'');
					a[p] = d[1];
					return a;
				},{})
				;
			path = event.dataTransfer.getData("text/plain");
			path = path.split('/').pop();
			let submission = new Submission(path,files);
			self.runner.addSubmissions(submission);
		});

		Object.observe(this.runner.submissions,(changes)=>{
			self.renderResults();
		});
		Object.observe(this.runner.results,(changes)=>{
			self.renderResults();
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

	attachSubmissions(blob){
		let parent = this;
		this.submissions = null;
		// 1) read the Blob
		return JSZip
			.loadAsync(blob)
			.then(function(zip) {
				zip = Submission.fileListFromZip(zip);
				return zip;
			})
			.then(function(files){
				parent.files = files;
				return files;
			})
			.catch(function (e) {
				console.error("Error reading " + blob.name + ": " + e.message);
			})
			;
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
			throw new ChecksimsException("Error: did not obtain a valid output strategy!");
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

	renderListTable(results,htmlContainers){
		let cellTemplate = "  <td><meter min='-1' max='100' value='{{pct}}' title='{{pct}}% similar'></meter><span title='{{pct}}% similar'>{{name}}</span> </td>";
		let html = [
				'<thead>',
				' <tr>',
				'  <th>Student</th>',
				'  <th>Student</th>',
				' </tr>',
				'</thead>',
				'<tbody>',
			];
		html = html.concat(results.results
			.map(function(d){
				let rtn = [
						{'name':d.A.submission.name,'pct':d.A.percentMatched},
						{'name':d.B.submission.name,'pct':d.B.percentMatched}
					].sort(function(a,b){
						let diff = b.pct - a.pct;
						return diff;
					});
				rtn.total = rtn[0].pct + rtn[1].pct;
				return rtn;
			})
			.sort(function(a,b){
				let diff = b.total - a.total;
				return diff;
			})
			.map(function(comp){
				let html = comp.map(function(d){
						return cellTemplate
							.replace(/{{name}}/g,d.name)
							.replace(/{{pct}}/g,(d.pct * 100).toFixed(0))
							;
					}).join('');
				html = [' <tr>', html, '</tr>',];
				return html.join('\n');
			}))
			;
		html.push('</tbody>');

		let lst = htmlContainers.lst;
		lst = lst.querySelector('.result');
		lst.innerHTML = html.join('\n');
	}


	renderListForce(results,htmlContainers){
		//let container = htmlContainers.force.querySelector('ul.result');
		//let dimensions = window.getComputedStyle(container);
		d3ForceDirected(results);
	}

	async renderResults(){
		let results = {
			"results" : Object.values(this.runner.results),
			"submissions": Object.values(this.runner.Submissions),
			"archives":this.runner.archiveSubmissions
		};
		let htmlContainers = this.Containers;

		this.renderMatrixes(results,htmlContainers);
		this.renderListTable(results,htmlContainers);
		this.renderListForce(results,htmlContainers);
	}


	/**
	 * Parse CLI arguments and run Checksims from them.
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
		let results = await checkSims.runChecksims();

		this.renderResults(results,htmlContainers);
	}

}



window.addEventListener('load',function(){
	let checker = new indexPage();
	let button = document.querySelector('button');
	let upload = document.querySelector("input[name='zip']");

	upload.disabled = false;

	upload.addEventListener('change',function(e){
		Array.from(e.target.files).forEach(function(file){
			if (!file.type === 'application/x-zip-compressed'){
				return;
			}
			checker.attachSubmissions(file)
				.then(function(files){
					console.log('Submissions attached');
				})
				;
		});
	});
});

