import { useMemo } from "react";
import { useAccessStore, useAppConfig } from "../store";
import { collectModelsWithDefaultModel } from "./model";
import { normalizeCustomModels } from "./model";

export function useAllModels() {
  const accessStore = useAccessStore();
  const configStore = useAppConfig();
  const models = useMemo(() => {
    if (!accessStore.hasConfiguredModelAccess()) {
      return [];
    }

    const customModels = normalizeCustomModels(
      accessStore.useCustomConfig
        ? configStore.customModels
        : accessStore.customModels,
    );
    if (!customModels) {
      return [];
    }

    return collectModelsWithDefaultModel(
      configStore.models,
      customModels,
      accessStore.defaultModel,
    );
  }, [
    accessStore.hasServerApiKey,
    accessStore.customModels,
    accessStore.defaultModel,
    accessStore.openaiApiKey,
    accessStore.azureApiKey,
    accessStore.azureUrl,
    accessStore.googleApiKey,
    accessStore.anthropicApiKey,
    accessStore.baiduApiKey,
    accessStore.baiduSecretKey,
    accessStore.bytedanceApiKey,
    accessStore.alibabaApiKey,
    accessStore.tencentSecretId,
    accessStore.tencentSecretKey,
    accessStore.moonshotApiKey,
    accessStore.iflytekApiKey,
    accessStore.iflytekApiSecret,
    accessStore.deepseekApiKey,
    accessStore.xaiApiKey,
    accessStore.chatglmApiKey,
    accessStore.siliconflowApiKey,
    accessStore.ai302ApiKey,
    accessStore.useCustomConfig,
    configStore.customModels,
    configStore.models,
  ]);

  return models;
}
