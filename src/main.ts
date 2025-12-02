import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ExceptionHandler } from "./extras/exception.filter";

type RawChannel = ReturnType<typeof import("socketcan")["createRawChannel"]>;

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	app.useGlobalFilters(new ExceptionHandler());
	app.enableShutdownHooks();
	await app.listen(process.env.PORT ?? 3200);
}
bootstrap();