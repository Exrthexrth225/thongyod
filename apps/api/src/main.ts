import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module.js'
import { assertProductionConfiguration } from './auth/policy.js'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { configureWeb } from './web.js'

async function bootstrap(): Promise<void> {
  assertProductionConfiguration()
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  configureWeb(app)
  app.enableShutdownHooks()
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0')
}

void bootstrap().catch(() => {
  console.error('API startup failed; dev login must be disabled for the production entry point.')
  process.exitCode = 1
})
