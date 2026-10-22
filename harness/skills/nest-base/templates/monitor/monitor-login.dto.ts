// Plantilla del harness → src/common/monitor/monitor-login.dto.ts
import { IsString, MaxLength } from 'class-validator';

export class MonitorLoginDto {
  @IsString()
  @MaxLength(512)
  password!: string;
}
