#include "runtime.h"

typedef struct { const int32_t id; } Entity;

int main(void) {
    TSC_INIT();
    Entity e = { .id = 1 };
    printf("%d\n", e.id);
    return 0;
}
