import { IsOptional, IsDefined, IsArray, IsInt, IsEnum, IsBoolean, Max, Min, ValidateNested, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ActionTrigger, ActionMode, ActionType } from 'src/device/device.types';

export class ActionDtoOutput {
	@IsInt()
	@Min(0)
	@Max(255)
	@IsOptional()
	skipWhenDelayDeviceId: number | null = null

	@IsArray()
	@ArrayMaxSize(12)
	@IsInt({ each: true })
	@Min(0, { each: true })
	@Max(11, { each: true })
	@IsOptional()
	skipWhenDelayPorts: number[] = [];

	@IsInt()
	@Min(0)
	@Max(255)
	@IsOptional()
	clearDelayDeviceId: number | null = null

	@IsArray()
	@ArrayMaxSize(12)
	@IsInt({ each: true })
	@Min(0, { each: true })
	@Max(11, { each: true })
	@IsOptional()
	clearDelayPorts: number[] = [];

	@IsInt()
	@Min(0)
	@Max(255)
	deviceId: number;

	@IsArray()
	@ArrayMaxSize(12)
	@IsInt({ each: true })
	@Min(0, { each: true })
	@Max(11, { each: true })
	ports: number[];

	@IsOptional()
	delay: number = 0;
}

export class ActionDto {
	@IsEnum(ActionTrigger)
	@IsOptional()
	trigger: ActionTrigger = ActionTrigger.disabled;

	@IsEnum(ActionMode)
	@IsOptional()
	mode: ActionMode = ActionMode.click;

	@IsEnum(ActionType)
	type: ActionType;

	@IsOptional()
	longpress: number = 0;

	@Min(0)
	@Max(4)
	@IsOptional()
	configSwitch: number = 0;

	@Type(() => ActionDtoOutput)
	@ValidateNested({ each: true })
	output: ActionDtoOutput;
}

export class DeviceConfigDto {
	// Button press states (e.g., 0/1)
	@IsInt()
	@Min(0)
	@Max(15)
	inputPortIdx: number;

	// Number in microseconds
	@IsInt()
	@Min(0)
	@Max(16777215)
	debounce: number;

	// Number in milliseconds
	@IsInt()
	@Min(0)
	@Max(16777215)
	doubleclick: number;

	@IsArray()
	@ArrayMaxSize(256)
	@ValidateNested({ each: true })
	@Type(() => ActionDto)
	actions: ActionDto[];

	// Bypass flag
	@IsInt()
	@Min(0)
	@Max(1)
	bypassInstantly: number;

	// Number in milliseconds
	@IsInt()
	@Min(0)
	@Max(16777215)
	bypassOnDisconnect: number;
}

export class DeviceCommandDto {
	@IsEnum(ActionType)
	type: ActionType;

	@IsInt({ message: 'delay must be positive integer number' })
	@Min(0) @Max(4294967295)
	@IsOptional()
	@Type(() => Number)
	delay: number = 0;

	@IsInt({ message: 'extra must be positive integer number' })
	@Min(0) @Max(4294967295)
	@IsOptional()
	@Type(() => Number)
	extra: number;
}