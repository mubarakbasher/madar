import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../auth/admin-auth.module";
import { TeamController } from "./team.controller";
import { TeamService } from "./team.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [TeamController],
  providers: [TeamService],
})
export class TeamModule {}
