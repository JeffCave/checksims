const child = require('child_process');

const webdriver = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const firefox = require('selenium-webdriver/firefox');

const https = require('https');
const fs = require('fs');
const root = process.cwd();


(function(){
	let path = `${root}/test/bin`;
	if(!process.env.PATH.includes(path)){
		process.env.PATH = `${process.env.PATH}:${path}`;
	}
})();


class Browsers {

	constructor(poolsize){
		this.poolsize = poolsize || 10;
		this.pool = [];
		this.avail = [];
		this.locked = [];

		let chromeOpts = new chrome.Options();
		//chromeOpts.headless = true;
		chromeOpts.addArguments('start-maximized');
		chromeOpts.addArguments('--no-sandbox');
		chromeOpts.addArguments('--remote-debugging-port=9222');
		chromeOpts.setChromeBinaryPath('/usr/bin/google-chrome');
		//chromeOpts.headless();

		this.chromeOpts = chromeOpts;
	}

	async take(){
		let browser = null;
		browser = await new webdriver.Builder()
			.forBrowser('chrome')
			.withCapabilities(webdriver.Capabilities.chrome())
			.setChromeOptions(this.chromeOpts)
			.build()
			;
		// get the default page
		await browser.get('http://lvh.me:3030');
		// wait for it to load
		let el = await browser.findElement(this.driver.By.css('main'));
		await browser.wait(this.driver.until.elementIsVisible(el),1000);
		// send it
		return browser;
	}

	async return(browser){
		await browser.quit();
	}

	use(func){
		let usable = async ()=>{
			let browser = await this.take();
			try {
				await func(browser);
			}
			finally {
				this.return(browser);
			}
		}
		return usable;
	}

	get allDrivers(){
		return {
			'chrome':{
					url:'https://chromedriver.storage.googleapis.com/78.0.3904.70/chromedriver_linux64.zip',
					name:'chromedriver',
					postprocess: ['unzip']
				},
				'firefox':{
					url:'https://github.com/mozilla/geckodriver/releases/download/v0.26.0/geckodriver-v0.26.0-linux64.tar.gz',
					name:'geckodriver',
					postprocess: ['untar -xzf']
			}
		};
	}

	static get driver(){
		return webdriver;
	}
	get driver(){
		return Browsers.driver;
	}
}


module.exports.Browsers = Browsers;
module.exports.pool = new Browsers(10);
