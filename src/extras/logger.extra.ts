import { Logger } from '@nestjs/common';

export class LoggerExtra extends Logger {
	private formatTimestamp(): string {
		const now = new Date();
		const iso = now.toISOString();
		const timeWithMs = iso.split('T')[1].replace('Z', '');
		return timeWithMs;
	}

	log(message: string) {
		super.log(`[${this.formatTimestamp()}] ${message}`);
	}

	error(message: string, trace?: string) {
		super.error(`[${this.formatTimestamp()}] ${message}`, trace);
	}

	warn(message: string) {
		super.warn(`[${this.formatTimestamp()}] ${message}`);
	}

	verbose(message: string) {
		super.warn(`[${this.formatTimestamp()}] ${message}`);
	}
}