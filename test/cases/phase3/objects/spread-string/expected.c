#include "runtime.h"

typedef struct { String label; } Item;

static void Item_free(Item *self) {
    if (!self) return;
    tsc_string_release(self->label);
}

int main(void) {
    TSC_INIT();
    Item a = {0};
    { String _tsc_tmp = STR_LIT("hello"); tsc_string_retain(_tsc_tmp); tsc_string_release(a.label); a.label = _tsc_tmp; }
    Item b = {.label = a.label};
    printf("%s\n", b.label.data);
    Item_free(&b);
    Item_free(&a);
    return 0;
}

