import { NextResponse } from "next/server";

import { getServerSideConfig } from "../../config/server";

// Danger! Do not hard code any secret value here!
// 警告！不要在这里写入任何敏感信息！
function getDangerConfig() {
  const serverConfig = getServerSideConfig();

  return {
    needCode: serverConfig.needCode,
    hideUserApiKey: serverConfig.hideUserApiKey,
    disableGPT4: serverConfig.disableGPT4,
    hideBalanceQuery: serverConfig.hideBalanceQuery,
    disableFastLink: serverConfig.disableFastLink,
    hasServerApiKey: serverConfig.hasServerApiKey,
    customModels: serverConfig.customModels,
    defaultModel: serverConfig.defaultModel,
    visionModels: serverConfig.visionModels,
  };
}

declare global {
  type DangerConfig = ReturnType<typeof getDangerConfig>;
}

async function handle() {
  return NextResponse.json(getDangerConfig());
}

export const GET = handle;
export const POST = handle;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
