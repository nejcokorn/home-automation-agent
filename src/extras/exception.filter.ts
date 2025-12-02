import { ExceptionFilter,Catch,ArgumentsHost,HttpException,HttpStatus } from '@nestjs/common';
import { TimeoutError } from './promise.extra';

@Catch()
export class ExceptionHandler implements ExceptionFilter {
	catch(exception: unknown, host: ArgumentsHost) {
		const ctx = host.switchToHttp();
		const response = ctx.getResponse();
		const request = ctx.getRequest();

		let status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

		let message: string | object;
		let type: string;
		if (exception instanceof HttpException) {
			message = exception.getResponse();
			type = "HttpException";
		} else if (exception instanceof TimeoutError) {
			message = exception.message;
			type = "TimeoutError";
		} else if (exception instanceof Error) {
			message = exception.message;
			type = "Error";
		} else {
			message = "Unknown Error!";
			type = "Unknown";
		}

		// Log to console or your logger
		console.error('Caught exception:', exception);

		response.status(status).json({
			success: false,
			error: {
				message: message,
				type: type,
			}
		});
	}
}