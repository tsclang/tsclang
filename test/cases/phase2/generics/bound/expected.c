#include "runtime.h"

typedef struct { int32_t id; String name; } _anon_0;

int32_t getId__anon_0(_anon_0 obj) {
    return obj.id;
}

int main(void) {
    TSC_INIT();
    _anon_0 user = {.id = 7, .name = STR_LIT("Alice")};
    printf("%d\n", getId__anon_0(user));
    return 0;
}
