import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GlossaryText } from "../../src/ui/GlossaryTerm";

describe("卡牌資訊的專有名詞標示", () => {
  it("只標示效果術語，不把手牌、牌組與棄堆等基礎區域做成關鍵字", () => {
    const markup = renderToStaticMarkup(<GlossaryText text="檢索1張牌加入手牌，之後召喚1名手下；該牌離場後進入棄堆，不返回牌組。" />);

    expect(markup).toContain(">檢索</button>");
    expect(markup).toContain(">召喚</button>");
    expect(markup).not.toContain(">手牌</button>");
    expect(markup).not.toContain(">棄堆</button>");
    expect(markup).not.toContain(">牌組</button>");
  });
});
