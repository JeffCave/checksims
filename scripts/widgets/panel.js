'use strict';

function restorePanel(e){
	e.target.classList.remove('minimized');
	e.target.removeEventListener('click',restorePanel);
}

let initialize = function(){
	let panels = document.querySelectorAll('main > section');
	panels = Array.from(panels);
	panels.forEach(function(panel){
		panel.classList.add('restore');
		let minimize = document.createElement('span');
		panel.prepend(minimize);
		minimize.innerHTML = '&#128469;';
		minimize.innerHTML = '_';
		minimize.style.float = 'right';
		minimize.style.zIndex = 1000;
		minimize.style.cursor = 'default';
		minimize.style.textShadow = '0 0 1px white';
		minimize.addEventListener('click',function(e){
			panel.classList.add('minimized');
			e.stopPropagation();
			panel.addEventListener('click',restorePanel);
		});
	});

	initialize = function(){};
};

if(document.readyState === 'complete'){
	initialize();
}
else{
	window.addEventListener('load',initialize);
}
