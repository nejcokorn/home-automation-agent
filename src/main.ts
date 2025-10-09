import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

type RawChannel = ReturnType<typeof import("socketcan")["createRawChannel"]>;

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	app.enableShutdownHooks();
	await app.listen(process.env.PORT ?? 32103);
}
bootstrap();