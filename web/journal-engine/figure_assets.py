"""Figure ownership checks shared by PDF proofs and issue export."""
import re


def figure_label(block):
    return re.match(r'^图\s*(\d+)(.*)', block.get('text', '').strip())


def figure_reference_ids(blocks):
    """Only explicit anchors to a figure with a matching owned caption count.

    Whitespace or a prose-looking verb alone cannot exempt an unbound caption.
    A figure numbered 1 also cannot exempt an anchor referring to figure 2.
    """
    by_id = {b.get('id'): b for b in blocks}
    references = set()
    for asset in blocks:
        if not (asset.get('type') == 'image' or
                asset.get('type') == 'table' and asset.get('cellImages')):
            continue
        target_id = (asset.get('anchor') or {}).get('targetId')
        target = by_id.get(target_id, {})
        label = figure_label(target)
        if target.get('type') not in ('paragraph', 'heading') or not label:
            continue
        for caption_id in asset.get('captionIds', []):
            caption = by_id.get(caption_id, {})
            caption_label = figure_label(caption)
            if (caption_id != target_id and caption.get('type') in ('paragraph', 'heading')
                    and caption_label and caption_label[1] == label[1]):
                references.add(target_id)
    return references


def missing_figures(document):
    blocks = document.get('blocks', [])
    owners = {c for b in blocks if b.get('type') == 'image' or
              b.get('type') == 'table' and b.get('cellImages') for c in b.get('captionIds', [])}
    references = figure_reference_ids(blocks)
    errors = []
    for index, block in enumerate(blocks):
        label = figure_label(block)
        following = re.match(r'^Fig\.?\s*(\d+)\b', blocks[index + 1].get('text', '').strip(), re.I) if index + 1 < len(blocks) else None
        is_caption = label and (re.match(r'^(?:\s|[.:：])', label[2]) or following and following[1] == label[1])
        if (block.get('type') in ('paragraph', 'heading') and is_caption
                and block.get('id') not in owners and block.get('id') not in references):
            errors.append({'code': 'FIGURE_ASSET_UNASSIGNED', 'severity': 'error', 'blockId': block.get('id')})
    return errors
