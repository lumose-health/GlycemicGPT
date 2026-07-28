import { Panel } from "@/components/Panel";
import {
  formatMacroValue,
  formatNetCarbs,
} from "@/lib/meal-format";
import type {
  ComorbidityNutrition,
  FoodRecord,
  NutritionFacts,
} from "@/lib/api";
import { GroundedSourceNote } from "./MealGrounding";
import { MealSafetyQualifier } from "./MealSafetyQualifier";

export function MealAssumedPortion({ portion }: { portion: string }) {
  return (
    <Panel
      bodyClassName="space-y-2"
      data-testid="meal-portion"
      heading="Assumed portion"
      headingLevel={2}
    >
      <p className="font_poppins font_body_1 text-foreground-primary">
        {portion}
      </p>
      <p className="font_poppins font_body_3 text-foreground-secondary">
        Portion size is the biggest source of error in a photo estimate. Does
        this match what you ate?
      </p>
    </Panel>
  );
}

export function MealNutritionFacts({ facts }: { facts: NutritionFacts }) {
  return (
    <Panel
      bodyClassName="space-y-4"
      heading="Estimated nutrition"
      headingLevel={2}
    >
      {facts.macros.length > 0 ? (
        <dl className="space-y-4">
          {facts.macros.map((macro) => (
            <div className="space-y-1" data-testid="meal-macro" key={macro.key}>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="font_poppins font_body_2 text-foreground-primary">
                  {macro.label}
                </dt>
                <dd
                  className="font_metric_label text-foreground-primary"
                  data-testid="meal-macro-value"
                >
                  {formatMacroValue(macro.value, macro.unit)}
                </dd>
              </div>
              {macro.glucose_note ? (
                <p
                  className="font_poppins font_body_4 text-foreground-secondary"
                  data-testid="meal-macro-note"
                >
                  {macro.glucose_note}
                </p>
              ) : null}
            </div>
          ))}
        </dl>
      ) : null}

      {facts.net_carbs ? (
        <div
          className="space-y-3 border-t border-border-default pt-4"
          data-testid="meal-net-carbs"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="font_metric_label text-foreground-secondary">
              Net carbs
            </span>
            <span className="font_metric_label text-foreground-primary">
              {formatNetCarbs(
                facts.net_carbs.low,
                facts.net_carbs.high,
              )}
            </span>
          </div>
          <MealSafetyQualifier
            qualifier={facts.net_carbs.caveat}
            testId="meal-net-carbs-caveat"
          />
        </div>
      ) : null}
    </Panel>
  );
}

export function MealNutritionDisclaimer({
  disclaimer,
}: {
  disclaimer: string;
}) {
  return (
    <p
      className="font_metric_caption text-center text-foreground-secondary"
      data-testid="meal-nutrition-disclaimer"
    >
      {disclaimer}
    </p>
  );
}

export function MealComorbidityNutrition({
  comorbidity,
  record,
}: {
  comorbidity: ComorbidityNutrition;
  record: FoodRecord;
}) {
  return (
    <Panel
      bodyClassName="space-y-4"
      data-testid="meal-comorbidity"
      heading="Heart and blood pressure awareness"
      headingLevel={2}
    >
      <dl className="space-y-4">
        {comorbidity.facts.map((fact) => (
          <div
            className="space-y-1"
            data-testid="meal-comorbidity-fact"
            key={fact.key}
          >
            <div className="flex items-baseline justify-between gap-3">
              <dt className="font_poppins font_body_2 text-foreground-primary">
                {fact.label}
              </dt>
              <dd
                className="font_metric_label text-foreground-primary"
                data-testid="meal-comorbidity-value"
              >
                {formatMacroValue(fact.value, fact.unit)}
              </dd>
            </div>
            {fact.note ? (
              <p
                className="font_poppins font_body_4 text-foreground-secondary"
                data-testid="meal-comorbidity-note"
              >
                {fact.note}
              </p>
            ) : null}
          </div>
        ))}
      </dl>

      {comorbidity.sugar_note ? (
        <MealSafetyQualifier
          qualifier={comorbidity.sugar_note}
          testId="meal-comorbidity-sugar-note"
        />
      ) : null}

      <GroundedSourceNote
        label="From"
        linkLabel="published data"
        linkTestId="meal-comorbidity-link"
        record={record}
        testId="meal-comorbidity-source"
      />

      <p
        className="font_metric_caption text-foreground-secondary"
        data-testid="meal-comorbidity-disclaimer"
      >
        {comorbidity.disclaimer}
      </p>
    </Panel>
  );
}
