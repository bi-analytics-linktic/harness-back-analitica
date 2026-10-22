// Plantilla del harness → src/common/monitor/widgets/endpoints-total.widget.spec.ts
import { Controller, Get, Post } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { EndpointsTotalWidget } from './endpoints-total.widget';

@Controller('cartera/resumen')
class CarteraController {
  @Get()
  list(): void {}

  @Get(['detalle', 'detalle-v2'])
  detail(): void {}

  helper(): void {}
}

@Controller()
class RecaudoController {
  @Get('recaudo/diario')
  daily(): void {}
}

@Controller('auth')
class AuthController {
  @Post('login')
  login(): void {}
}

@Controller('health')
class HealthController {
  @Get()
  check(): void {}
}

describe('EndpointsTotalWidget', () => {
  it('counts routes by module segment and skips auth, health and monitor', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscoveryModule],
      controllers: [CarteraController, RecaudoController, AuthController, HealthController],
      providers: [EndpointsTotalWidget],
    }).compile();
    await expect(moduleRef.get(EndpointsTotalWidget).collect()).resolves.toEqual({
      value: 4,
      detail: [
        { label: 'cartera', value: 3 },
        { label: 'recaudo', value: 1 },
      ],
    });
  });
});
