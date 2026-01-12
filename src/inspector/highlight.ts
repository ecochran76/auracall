import type CDP from 'chrome-remote-interface';

export async function highlightSelector(client: Awaited<ReturnType<typeof CDP>>, selector: string) {
  try {
    const { root } = await client.DOM.getDocument();
    const { nodeId } = await client.DOM.querySelector({
      nodeId: root.nodeId,
      selector
    });

    if (nodeId) {
      const dom = client.DOM as unknown as {
        highlightNode?: (args: {
          nodeId: number;
          highlightConfig: {
            contentColor: { r: number; g: number; b: number; a: number };
            borderColor: { r: number; g: number; b: number; a: number };
            showInfo: boolean;
          };
        }) => Promise<void>;
      };
      if (dom.highlightNode) {
        await dom.highlightNode({
          nodeId,
          highlightConfig: {
            contentColor: { r: 155, g: 11, b: 239, a: 0.3 },
            borderColor: { r: 155, g: 11, b: 239, a: 0.7 },
            showInfo: true
          }
        });
      }
      return true;
    }
    return false;
  } catch (error) {
    console.error('Highlight failed:', error);
    return false;
  }
}

export async function clearHighlight(client: Awaited<ReturnType<typeof CDP>>) {
  await client.Overlay.hideHighlight();
}
