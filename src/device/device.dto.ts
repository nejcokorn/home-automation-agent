import { IsOptional, IsDefined, IsArray, IsInt, IsEnum, IsBoolean, Max, Min, ValidateNested, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ActionType, ActionMode } from 'src/device/device.types';

export class ActionDto {
	@IsInt()
	@Min(0)
	@Max(255)
	deviceId: number;

	@IsEnum(ActionType)
	type: ActionType;

	@IsEnum(ActionMode)
	@IsOptional()
	mode: ActionMode = ActionMode.NORMAL;

	@IsArray()
	@ArrayMaxSize(12)
	@IsInt({ each: true })
	@Min(0, { each: true })
	@Max(11, { each: true })
	ports: number[];

	@IsOptional()
	delay: number = 0;
}

export class DeviceConfigDto {
	// Button press states (e.g., 0/1)
	@IsInt()
	@Min(0)
	@Max(1)
	buttonRisingEdge: number;

	// Button press states (e.g., 0/1)
	@IsInt()
	@Min(0)
	@Max(1)
	buttonFallingEdge: number;

	// Switch state (e.g., 0/1)
	@IsInt()
	@Min(0)
	@Max(1)
	switch: number;

	// Number in microseconds
	@IsInt()
	@Min(0)
	@Max(16777215)
	debounce: number;

	// Number in milliseconds
	@IsInt()
	@Min(0)
	@Max(16777215)
	longpress: number;

	// Number in milliseconds
	@IsInt()
	@Min(0)
	@Max(16777215)
	doubleclick: number;

	@IsArray()
	@ArrayMaxSize(196)
	@ValidateNested({ each: true })
	@Type(() => ActionDto)
	actions: ActionDto[];

	// Bypass flag
	@IsInt()
	@Min(0)
	@Max(1)
	bypassInstantly: number;

	// Bypass flag
	@IsInt()
	@Min(0)
	@Max(1)
	bypassOnDIPSwitch: number;

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
	extra: number = 0;
}