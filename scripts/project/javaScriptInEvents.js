

const scriptsInEvents = {

	async Gamee_Event8_Act1(runtime, localVars)
	{
		runtime.eco?.togglePause();
	},

	async Gamee_Event9_Act1(runtime, localVars)
	{
		runtime.eco?.toggleSpeed();
	},

	async Gamee_Event10_Act1(runtime, localVars)
	{
		runtime.eco?.toggleZoom();
	},

	async Gamee_Event11_Act1(runtime, localVars)
	{
		runtime.eco?.toggleHelp();
	},

	async Gamee_Event13_Act2(runtime, localVars)
	{
		runtime.eco?.toggleSound();
	},

	async Gamee_Event14_Act1(runtime, localVars)
	{
		runtime.eco?.fullscreenHint();
	}
};

globalThis.C3.JavaScriptInEvents = scriptsInEvents;
