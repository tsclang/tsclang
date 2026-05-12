#include "runtime.h"

typedef struct { String name; int32_t age; } User;
typedef struct { const String name; const int32_t age; } ReadonlyUser;

int main(void) {
    TSC_INIT();
    const ReadonlyUser u = { .name = STR_LIT("Bob"), .age = 25 };
    printf("%s\n", u.name.data);
    return 0;
}
