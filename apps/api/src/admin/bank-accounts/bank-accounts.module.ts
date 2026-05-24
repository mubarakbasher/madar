import { Module } from "@nestjs/common";
import { AdminAuthModule } from "../auth/admin-auth.module";
import { BankAccountsController } from "./bank-accounts.controller";
import { BankAccountsService } from "./bank-accounts.service";
import { CryptoService } from "../../common/crypto.service";

@Module({
  imports: [AdminAuthModule],
  controllers: [BankAccountsController],
  providers: [BankAccountsService, CryptoService],
})
export class BankAccountsModule {}
