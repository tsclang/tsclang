#include "runtime.h"

typedef struct { int32_t id; } Item;
typedef struct { bool has_value; Item *value; int _pool_idx; } opt_ref_Item;

static Item _item_pool[32];
static uint32_t _item_pool_mask = 0;

static opt_ref_Item Item_alloc(void) {
    for (int _i = 0; _i < 32; _i++) {
        if (!(_item_pool_mask & ((uint32_t)1 << _i))) {
            _item_pool_mask |= ((uint32_t)1 << _i);
            return (opt_ref_Item){true, &_item_pool[_i], _i};
        }
    }
    return (opt_ref_Item){false, NULL, -1};
}

static void Item_drop(opt_ref_Item i) {
    if (i.has_value) _item_pool_mask &= ~((uint32_t)1 << i._pool_idx);
}

Result_i32_TscError _tsc_main(void) {
    opt_ref_Item _pool_0 = Item_alloc();
    if (!_pool_0.has_value) {
        return (Result_i32_TscError){.ok = false, .error = Error_new(STR_LIT("pool exhausted: Item"))};
    }
    opt_ref_Item a = _pool_0;
    a.value->id = 1;
    return (Result_i32_TscError){.ok = true, .value = a.value->id};
    Item_drop(a);
}

int main(void) {
    TSC_INIT();
    Result_i32_TscError _unwrap_1 = _tsc_main();
    if (!_unwrap_1.ok) { tsc_panic(_unwrap_1.error._base.message); }
    printf("%d\n", _unwrap_1.value);
    return _tsc_main();
}
