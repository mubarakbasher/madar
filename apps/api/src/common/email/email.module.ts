import { Global, Module, type Provider } from "@nestjs/common";
import { loadEnv } from "../../env";
import { DiskEmailProvider } from "./disk.provider";
import { EmailService } from "./email.service";
import { EMAIL_PROVIDER } from "./email.types";
import { ResendEmailProvider } from "./resend.provider";

const providerFactory: Provider = {
  provide: EMAIL_PROVIDER,
  useFactory: (resend: ResendEmailProvider, disk: DiskEmailProvider) => {
    const env = loadEnv();
    return env.EMAIL_PROVIDER === "resend" ? resend : disk;
  },
  inject: [ResendEmailProvider, DiskEmailProvider],
};

@Global()
@Module({
  providers: [DiskEmailProvider, ResendEmailProvider, providerFactory, EmailService],
  exports: [EmailService],
})
export class EmailModule {}
