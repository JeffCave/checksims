'use strict';

/*
global JSZip
*/


import {DeepDiff} from './DeepDiff/DeepDiff.js';
import {Submission} from './DeepDiff/submission/Submission.js';
import * as unpack from './DeepDiff/util/unpack.js';
import {psFile} from './DeepDiff/util/psFile.js';
import {ContentHandlers} from './DeepDiff/submission/ContentHandlers.js';


import './widgets/psFileDrop.js';
import './widgets/psForceDirected.js';
import './widgets/psMatrixMap.js';
import './widgets/psPanelElement.js';
import './widgets/psSubmissions.js';
import './widgets/psTabbedPanelElement.js';
import './widgets/psTornadoChart.js';

/*
global File
global saveAs
*/


/**
 * Parses DeepDiff' command-line options.
 *
 * TODO: Consider changing from a  class? Having as an instance variable would greatly simplify
 */
class indexPage {
	constructor() {
		this.runner = new DeepDiff();

		let deleteall = document.querySelector('#DeleteAll');
		let save = document.querySelector('#Download');
		let restorebtn = document.querySelector('#RestoreClicker');
		let restore = document.querySelector('#Restore');
		deleteall.addEventListener('click',()=>{
			this.runner.Clear();
		});
		save.addEventListener('click',async ()=>{
			let json = await this.runner.Export();
			json = JSON.stringify(json);
			var zip = new JSZip();
			zip.file("db.json", json);
			let title = this.runner.Title;
			title += ".miss";
			await zip
				.generateAsync({type : "blob"})
				.then(function(content) {
					//content = window.btoa(content);
					saveAs(content, title);
				})
				;
		});
		restorebtn.addEventListener('click',()=>{
			restore.click();
		});
		restore.addEventListener('change', async (e)=>{
			let files = Array.from(e.target.files).map(f=>{
				return new File([f],f.name,{type:'application/zip'});
			});
			files = await unpack.unPack(files);
			let json = [];
			for(let f in files){
				f = files[f];
				f = new psFile(f);
				f = await f.read('text');
				json.push(f);
			}
			json = json.join('');
			json = JSON.parse(json);
			this.runner.Import(json);
		});

		Array.from(document.querySelectorAll('form[is="deepdiff-opts"]')).forEach(opts=>{
			opts.ddInstance = this.runner;
		});
		let forcechart = document.querySelector('#forcechart');
		forcechart.results = this.runner;
		let tornadochart = document.querySelector('#tornadochart');
		tornadochart.DeepDiff = this.runner;
		let matrixmap = document.querySelector('#matrixmap');
		matrixmap.DeepDiff = this.runner;
		let submissions = document.querySelector('#submissions');
		submissions.DeepDiff = this.runner;

		let uploadSubmission = document.querySelector('#UploadSubmission');
		uploadSubmission.addEventListener('change', async (e)=>{
			let files = e.target.files;
			let folder = await this.FindFolderStart(files);
			let submission = new Submission(folder.name,folder.files);
			this.runner.addSubmissions(submission);
		});

		let uploadSubmissions = document.querySelector('#UploadSubmissions');
		uploadSubmissions.addEventListener('change', async (e)=>{
			let files = e.target.files;
			let folder = await this.FindFolderStart(files);
			folder.files = this.GroupFolders(folder.files, folder.name);
			let submissions = [];
			for(let key in folder.files){
				let values = folder.files[key];
				let submission = new Submission(key,values);
				submissions.push(submission);
			}
			this.runner.addSubmissions(submissions);
		});

	}



	GroupFolders(files,prefix='.'){
		prefix = prefix.split('/').join('/');
		let groups = {};
		Object.entries(files).forEach((file)=>{
			let name = file[0].split('/');
			file = file[1];
			let group = name.shift();
			group = [prefix,group].join('/');
			name = name.join('/');

			groups[group] = groups[group] || {};
			groups[group][name] = file;
		});
		return groups;
	}


	async FindFolderStart(files){
		files = await unpack.unPack(files);



		let values = files;
		for(let f in values){
			let file = values[f];
			let type = file.type;
			if(type === 'application/octet-stream'){
				let ext = file.name.split('.').pop();
				let handler = ContentHandlers.lookupHandlerByExt(ext);
				type = handler.mime;
				if(!type){
					type = 'text/plain';
					if(ContentHandlers.ignores.includes(ext)){
						type = 'application/octet';
					}
				}
			}
			let path = f.split('/'); path.pop(); path = path.join('/');
			file = new psFile(file, file.name, {type:type,relativePath:path});
			file = await file.toJSON();
			values[f] = file;
		}
		files = values;



		let maxlen = Number.MAX_VALUE;
		let names = Object.keys(files)
			.map((file)=>{
				let path = file.split('/');
				maxlen = Math.min(maxlen,path.length);
				return path;
			})
			.map(path=>{
				path = path.slice(0,maxlen);
				return path;
			})
			;

		for(let allsame = false; !allsame && maxlen > 0; maxlen--){
			allsame = names
				.map(name=>{
					return name.join('/');
				})
				.every((name,i,names)=>{
					if(i === 0){
						return true;
					}
					let rtn = name === names[i-1];
					return rtn;
				})
				;
			if(!allsame){
				names.forEach((name)=>{
					name.pop();
				});
			}
		}
		let name = names[0] || [];
		name = name.join('/');

		files = Object.entries(files).reduce((a,d)=>{
			let key = d[0].substr(name.length+1); //.split('/').join('/');
			let value = d[1];
			a[key] = value;
			return a;
		},{});

		name = name.split('/');
		while(['.','file:',''].includes(name[0])){
			name.shift();
		}
		name = name.join('/');

		return {
			name: name,
			files: files
		};
	}


}



window.addEventListener('load',async function(){
	let checker = new indexPage();
});

