'use strict';

/*
global Vue
global JSZip
*/


import {DeepDiff} from './DeepDiff/DeepDiff.js';
import {Submission} from './DeepDiff/submission/Submission.js';


import './widgets/diffview.js';
import './widgets/filedrop.js';
import './widgets/force.js';
import './widgets/panel.js';
import './widgets/submissions.js';
import './widgets/tabbedPanel.js';
import './widgets/treeview.js';
import './widgets/ResultsTable.js';
import './widgets/ResultsMatrix.js';



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

		Array.from(document.querySelectorAll('form[is="deepdiff-opts"]')).forEach(opts=>{
			opts.ddInstance = this.runner;
		});
		let forcechart = document.querySelector('#forcechart');
		forcechart.results = this.runner.report;
		let tornadochart = document.querySelector('#tornadochart');
		tornadochart.report = this.runner.report;
		let matrixmap = document.querySelector('#matrixmap');
		matrixmap.report = this.runner.report;
		let filedrop = document.querySelector('#filedrop');
		filedrop.addEventListener('change', (e)=>{
			Array.from(e.target.files).forEach((file)=>{
				if (file.type === 'application/x-zip-compressed' || file.type === 'application/zip'){
					self.attachSubmissions(file)
						.then(function(files){
							console.log('Submissions attached');
						})
						;
				}
			});
		});

		this.displaySubmissions = new Vue({
			el:'#submissions',
			data: {
				db: this.runner.db,
				filter: 'checksims/submissions',
			},
		});
		this.displayFiles = new Vue({
			el: '#files',
			data: {
				treeData: this.files,
				onfile: ()=>{}
			}
		});
		this.displayDiff = new Vue({
			el:'#compare',
			data: {
				report:this.runner.report
			},
		});

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
});

