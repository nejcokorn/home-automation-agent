import { IsArray, IsInt, Max, Min } from 'class-validator';

export class DeviceConfigDto {
	// Button press states (e.g., 0/1)
	@IsInt() @Min(0) @Max(1)
	ButtonRisingEdge: number;

	// Button press states (e.g., 0/1)
	@IsInt() @Min(0) @Max(1)
	ButtonFallingEdge: number;

	// Switch state (e.g., 0/1)
	@IsInt() @Min(0) @Max(1)
	Switch: number;

	// Action codes
	@IsArray()
	ActionToggle: number[];

	@IsArray()
	ActionHigh: number[];

	@IsArray()
	ActionLow: number[];

	// Timings in milliseconds
	@IsInt() @Min(0)
	Debounce: number;

	// Timings in milliseconds
	@IsInt() @Min(0)
	Longpress: number;

	// Timings in milliseconds
	@IsInt() @Min(0)
	LongpressDelayOff: number;

	// Bypass flag
	@IsInt() @Min(0) @Max(1)
	BypassInstantly: number;

	// Bypass flag
	@IsInt() @Min(0) @Max(1)
	BypassOnDIPSwitch: number;

	// Bypass in milliseconds
	@IsInt() @Min(0)
	BypassOnDisconnect: number;
}