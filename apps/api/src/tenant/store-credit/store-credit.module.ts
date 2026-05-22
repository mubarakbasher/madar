import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { StoreCreditController } from "./store-credit.controller";
import { StoreCreditService } from "./store-credit.service";

@Module({
  imports: [AuthModule],
  controllers: [StoreCreditController],
  providers: [StoreCreditService],
  exports: [StoreCreditService],
})
export class StoreCreditModule {}
