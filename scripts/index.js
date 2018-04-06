'use strict';


/*
global JSZip
global RegExp
global d3

global ChecksimsConfig
global ChecksimsException
global ChecksimsRunner
global CommonCodeLineRemovalPreprocessor
global MatrixPrinterRegistry
global Submission
global SimilarityMatrix
global Tokenizer

global checkArgument
global checkNotNull
*/

/**
 * Parses Checksims' command-line options.
 *
 * TODO: Consider changing from a  class? Having the CommandLine as an instance variable would greatly simplify
 */
class ChecksimsCommandLine {
	constructor() {
		this.submissions = null;
		this.archive = null;
		this.common = null;
	}

	attachSubmissions(blob){
		let parent = this;
		this.submissions = null;
		// 1) read the Blob
		return JSZip
			.loadAsync(blob)
			.then(function(zip) {
				parent.submissions = zip;
				//zip.forEach(function (relativePath, zipEntry) {
				//	// 2) print entries
				//	console.log(zipEntry.name);
				//	zipEntry
				//		.async("string")
				//		.on("data", function (data) { })
				//		.on("error", function (e) { })
				//		.on("end", function () { })
				//		;
				//});
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

		let resultsMatrix = SimilarityMatrix.generateMatrix(results);

		// Output using all output printers
		let outputMap = Promise.all(deduplicatedStrategies
			.map(function(name){
				return MatrixPrinterRegistry.getInstance().getImplementationInstance(name);
			}))
			.then(function(outputs){
				outputs = outputs
					.reduce(function(a,p){
						console.log("Generating " + p.getName() + " output");
						a[p.getName()] = p.printMatrix(resultsMatrix);
						return a;
					},{})
					;

				// Output for all specified strategies
				Object.entries(outputs).forEach(function(strategy){
					let key = strategy[0];
					let val = strategy[1];
					if(key in htmlContainers){
						htmlContainers[key].querySelector('.result').innerHTML = val;
					}
				});
		});
	}

	renderListTable(results,htmlContainers){
		let cellTemplate = [
				,"  <td><meter min='0' max='100' value='{{pct}}' title='{{pct}}% similar'></meter><span title='{{pct}}% similar'>{{name}}</span> </td>"
			].join('\n')
			;
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
			.sort(function(a,b){
				let diff = b.percentMatchedA - a.percentMatchedA;
				if(diff === 0){
					diff = b.percentMatchedB - a.percentMatchedB;
				}
				return diff;
			})
			.map(function(comp){
				let html = [
						cellTemplate
							.replace(/{{name}}/g,comp.a.name)
							.replace(/{{pct}}/g,(comp.percentMatchedA * 100).toFixed(0))
						,
						cellTemplate
							.replace(/{{name}}/g,comp.b.name)
							.replace(/{{pct}}/g,(comp.percentMatchedB * 100).toFixed(0))
					].join('')
					;
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
		let container = htmlContainers.force.querySelector('ul.result');
		let dimensions = window.getComputedStyle(container);

		d3ForceDirected(results);
	}

	async renderResults(results,htmlContainers){
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
	async runHtml(htmlContainers){
		let checkSims = new ChecksimsRunner();
		checkSims.Submissions = this.submissions;
		checkSims.CommonCode = this.common;
		checkSims.ArchiveSubmissions = this.archive;
		let results = await checkSims.runChecksims();

		this.renderResults(results,htmlContainers);
	}




}



window.addEventListener('load',function(){
	let checker = new ChecksimsCommandLine();
	let button = document.querySelector('button');
	let upload = document.querySelector("input[name='zip']");
	let outputFlds = Array.from(document.querySelectorAll('#results > details'))
		.reduce(function(a,d){
			if(d.dataset.type){
				a[d.dataset.type] = d;
			}
			return a;
		},{})
		;

	button.addEventListener('click',function(e){
		checker.runHtml(outputFlds);
	});

	upload.addEventListener('change',function(e){
		Array.from(e.target.files).forEach(function(file){
			if (!file.type === 'application/x-zip-compressed'){
				return;
			}
			checker
				.attachSubmissions(file)
				.then(function(){
					button.disabled = false;
					let ul = document.querySelector("ul");
					let entries = [];
					checker.submissions.forEach(function(path,entry) {
						entries.push(entry);
					});
					ul.innerHTML = entries.sort((a,b)=>{
							a = a.name;
							b = b.name;
							if(a===b) return 0;
							if(a<b) return -1;
							return 1;
						})
						.map((entry)=>{
							return '<li>'+entry.name+'</li>';
						})
						.join('')
						;
				})
				;
		});
	});
});

