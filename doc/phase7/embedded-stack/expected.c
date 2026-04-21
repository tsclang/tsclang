#include "runtime.h"

static uintptr_t items_stack[16];
static uint8_t items_stack_top = 0;

void process(void) {
    (items_stack[items_stack_top++] = (uintptr_t)(42));
    const int32_t empty = (items_stack_top == 0);
    printf("%d\n", empty);
    const int32_t val = ((int32_t)items_stack[--items_stack_top]);
    printf("%d\n", val);
}

int main(void) {
    TSC_INIT();
    process();
    return 0;
}
