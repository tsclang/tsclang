#include "runtime.h"

typedef struct { String name; int32_t age; String email; } User;
typedef struct { String name; } UserName;

int main(void) {
    TSC_INIT();
    const UserName u = {.name = STR_LIT("Alice")};
    printf("%s\n", u.name.data);
    return 0;
}
