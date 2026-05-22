import { Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module";
import { MoversController } from "./movers.controller";
import { MoversService } from "./movers.service";

@Module({
  imports: [AuthModule],
  controllers: [MoversController],
  providers: [MoversService],
  exports: [MoversService],
})
export class MoversModule {}
