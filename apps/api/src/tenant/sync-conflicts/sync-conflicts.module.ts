import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SyncConflictsController } from "./sync-conflicts.controller";
import { SyncConflictsService } from "./sync-conflicts.service";

@Module({
  imports: [AuthModule],
  controllers: [SyncConflictsController],
  providers: [SyncConflictsService],
  exports: [SyncConflictsService],
})
export class SyncConflictsModule {}
