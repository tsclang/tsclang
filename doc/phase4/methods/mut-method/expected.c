#include "runtime.h"

typedef struct { int32_t value; } Counter;

static void Counter_increment(Counter *self) {
    self->value = self->value + 1;
}

int main(void) {
    TSC_INIT();
    Counter c = {0};
    c.value = 0;
    Counter_increment(&c);
    Counter_increment(&c);
    printf("%d\n", c.value);
    return 0;
}
