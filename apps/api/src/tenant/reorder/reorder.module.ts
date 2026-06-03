import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ReorderController } from "./reorder.controller";
import { ReorderService } from "./reorder.service";

@Module({
  imports: [AuthModule],
  controllers: [ReorderController],
  providers: [ReorderService],
  exports: [ReorderService],
})
export class ReorderModule {}
