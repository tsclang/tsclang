#include "runtime.h"

typedef struct { String name; int32_t age; String email; } User;
typedef struct { String name; String email; } UserContact;

int main(void) {
    TSC_INIT();
    const UserContact u = {.name = STR_LIT("Bob"), .email = STR_LIT("bob@x.com")};
    printf("%s\n", u.email.data);
    return 0;
}
