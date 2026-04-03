#include "runtime.h"

typedef struct { String name; int32_t age; } User;
typedef struct { bool has_name; String name; bool has_age; int32_t age; } PartialUser;

int main(void) {
    TSC_INIT();
    PartialUser u = {.has_name = false, .has_age = false};
    return 0;
}
