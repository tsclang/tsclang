#include "runtime.h"

typedef struct { int32_t _refcount; int32_t _weakcount; String label; int32_t value; } Item;

static void Item_free(Item *self) {
    if (!self) return;
    tsc_string_release(self->label);
}

int main(void) {
    TSC_INIT();
    Item *item = tsc_arc_alloc(sizeof(Item));
    { String _tsc_tmp = STR_LIT("hello"); tsc_string_retain(_tsc_tmp); tsc_string_release(item->label); item->label = _tsc_tmp; }
    item->value = 42;
    printf("%s\n", item->label.data);
    printf("%d\n", item->value);
    Item_free(item); tsc_arc_release(item);
    return 0;
}
