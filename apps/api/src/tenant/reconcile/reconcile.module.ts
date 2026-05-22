import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ReconcileController } from "./reconcile.controller";
import { ReconcileService } from "./reconcile.service";

@Module({
  imports: [AuthModule],
  controllers: [ReconcileController],
  providers: [ReconcileService],
})
export class ReconcileModule {}
