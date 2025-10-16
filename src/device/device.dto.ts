import { IsDefined, IsArray, IsInt, Max, Min, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';

export class DeviceConfigDto {
	// Button press states (e.g., 0/1)
	@IsInt()
	@Min(0)
	@Max(1)
	ButtonRisingEdge: number;

	// Button press states (e.g., 0/1)
	@IsInt()
	@Min(0)
	@Max(1)
	ButtonFallingEdge: number;

	// Switch state (e.g., 0/1)
	@IsInt()
	@Min(0)
	@Max(1)
	Switch: number;

	// Action codes
	@IsArray()
	@ArrayMinSize(0)
	@ArrayMaxSize(12)
	@IsInt({ each: true })
	@Min(1, { each: true })
	@Max(12, { each: true })
	ActionToggle: number[];

	@IsArray()
	@ArrayMinSize(0)
	@ArrayMaxSize(12)
	@IsInt({ each: true })
	@Min(1, { each: true })
	@Max(12, { each: true })
	ActionHigh: number[];

	@IsArray()
	@ArrayMinSize(0)
	@ArrayMaxSize(12)
	@IsInt({ each: true })
	@Min(1, { each: true })
	@Max(12, { each: true })
	ActionLow: number[];

	// Number in microseconds
	@IsInt()
	@Min(0)
	@Max(16777215)
	Debounce: number;

	// Number in milliseconds
	@IsInt()
	@Min(0)
	@Max(16777215)
	Longpress: number;

	// Number in milliseconds
	@IsInt()
	@Min(0)
	@Max(16777215)
	LongpressDelayOff: number;

	// Bypass flag
	@IsInt()
	@Min(0)
	@Max(1)
	BypassInstantly: number;

	// Bypass flag
	@IsInt()
	@Min(0)
	@Max(1)
	BypassOnDIPSwitch: number;

	// Number in milliseconds
	@IsInt()
	@Min(0)
	@Max(16777215)
	BypassOnDisconnect: number;
}

export class DeviceCommandDto {
	@IsInt() @Min(0) @Max(1)
	@IsDefined()
	@IsInt({ message: 'state must be an integer' })
	@Type(() => Number)
	state: number;
}