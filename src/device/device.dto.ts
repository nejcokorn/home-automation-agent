import { IsOptional, IsDefined, IsArray, IsInt, IsEnum, IsBoolean, Max, Min, ValidateNested, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ActionType } from 'src/device/device.types';

export class ActionDto {
	@IsInt()
	@Min(0)
	@Max(255)
	deviceId: number;

	@IsEnum(ActionType)
	type: ActionType;

	@IsArray()
	@ArrayMaxSize(12)
	@IsInt({ each: true })
	@Min(0, { each: true })
	@Max(11, { each: true })
	ports: number[];
}

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

	@IsOptional()
	@IsInt()
	@Min(0)
	@Max(1)
	ActionReset?: number;

	@IsArray()
	@ArrayMaxSize(196)
	@ValidateNested({ each: true })
	@Type(() => ActionDto)
	Actions: ActionDto[];

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
	LongpressDelayLow: number;

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
	@IsBoolean()
	@IsDefined()
	@Type(() => Boolean)
	toggle: Boolean;

	@IsInt({ message: 'state must be an integer' })
	@Min(0) @Max(1)
	@IsDefined()
	@Type(() => Number)
	state: number;

	@IsInt({ message: 'delayLow must be an integer' })
	@Min(0) @Max(16777215)
	@IsDefined()
	@Type(() => Number)
	delayLow: number;

}