#include "runtime.h"

typedef struct { int32_t value; } Builder;

static Builder Builder_set(Builder self, int32_t v) {
    self.value = v;
    return self;
}

int main(void) {
    TSC_INIT();
    Builder b = {0};
    b.value = 0;
    b = Builder_set(b, 42);
    printf("%d\n", b.value);
    return 0;
}
