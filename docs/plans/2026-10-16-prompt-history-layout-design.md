# Prompt History Layout Design

## Goal

Make `rewindex list` easier to scan without changing snapshot or restore semantics.

## Output

Each item uses a fixed 88-character width:

```text
1. 61140b998c                                                               3 dk önce
                                                1 değişen · 2 eklenen · 1 silinen
   Prompt: Eski dosyayı kaldır, ana dosyayı güncelle ve
           iki yeni örnek dosya oluştur…
   Özet: main.txt önceki haline döner; a.txt ve b.txt kaldırılır;
         old.txt yeniden oluşturulur.
```

- Time and change counts are right-aligned to the same trailing edge.
- Prompt text is wrapped to at most two lines and then truncated with an ellipsis.
- The summary names representative changed, added, and deleted paths and describes what restore will do.
- The visible number remains a valid selector (`rewindex diff 3`, `rewindex restore 3`). The hash remains visible as a stable selector because list numbers shift when newer prompts arrive.

## Scope

Only list rendering and its assertions change. Diff, restore, snapshot storage, selector resolution, and the installed skill syntax remain unchanged.
