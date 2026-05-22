import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { TaxClassesController } from "./tax-classes.controller";
import { TaxClassesService } from "./tax-classes.service";

@Module({
  imports: [AuthModule],
  controllers: [TaxClassesController],
  providers: [TaxClassesService],
  exports: [TaxClassesService],
})
export class TaxClassesModule {}
