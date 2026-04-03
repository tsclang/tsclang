#include "runtime.h"

typedef struct { String name; int32_t age; String email; String role; } User;
typedef struct { String name; String role; } Minimal;

int main(void) {
    TSC_INIT();
    const Minimal u = {.name = STR_LIT("X"), .role = STR_LIT("admin")};
    printf("%s\n", u.role.data);
    return 0;
}
